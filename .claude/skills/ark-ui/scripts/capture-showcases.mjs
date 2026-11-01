#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const skillDirectory = dirname(scriptDirectory);
const showcaseDirectory = join(skillDirectory, 'assets', 'showcases');
const screenshotDirectory = join(showcaseDirectory, 'screenshots');
const edgeBinary = process.env.ARK_UI_EDGE_BIN
  || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const includeMobile = process.argv.includes('--mobile');

const samples = [
  ['ark', 'ark.html'],
  ['endfield', 'endfield.html'],
  ['exa', 'exa.html'],
  ['popucom', 'popucom.html'],
  ['corporate', 'corporate.html'],
];

const profiles = [
  { label: 'desktop', width: 1440, height: 900, mobile: false },
  ...(includeMobile ? [{ label: 'mobile', width: 390, height: 844, mobile: true }] : []),
];

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
        return;
      }
      const key = `${message.sessionId || 'browser'}:${message.method}`;
      const listeners = this.listeners.get(key) || [];
      listeners.forEach((listener) => listener(message.params));
    });
  }

  command(method, params = {}, sessionId) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    const promise = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.send(JSON.stringify(payload));
    return promise;
  }

  once(method, sessionId) {
    const key = `${sessionId || 'browser'}:${method}`;
    return new Promise((resolve) => {
      const listener = (params) => {
        this.listeners.set(key, (this.listeners.get(key) || []).filter((item) => item !== listener));
        resolve(params);
      };
      this.listeners.set(key, [...(this.listeners.get(key) || []), listener]);
    });
  }

  close() {
    this.socket.close();
  }
}

function launchEdge(userDataDirectory) {
  const processHandle = spawn(edgeBinary, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDirectory}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const webSocketUrl = new Promise((resolve, reject) => {
    let stderr = '';
    processHandle.stderr.setEncoding('utf8');
    processHandle.stderr.on('data', (chunk) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) resolve(match[1]);
    });
    processHandle.once('exit', (code) => reject(new Error(`Edge exited before CDP was ready (${code}).`)));
    processHandle.once('error', reject);
  });

  return { processHandle, webSocketUrl };
}

async function createPage(client) {
  const { targetId } = await client.command('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await client.command('Target.attachToTarget', { targetId, flatten: true });
  await client.command('Page.enable', {}, sessionId);
  return { targetId, sessionId };
}

async function capture(client, sessionId, sampleName, htmlFile, profile) {
  await client.command('Emulation.setDeviceMetricsOverride', {
    width: profile.width,
    height: profile.height,
    deviceScaleFactor: 1,
    mobile: profile.mobile,
    screenWidth: profile.width,
    screenHeight: profile.height,
  }, sessionId);

  const pageUrl = new URL(pathToFileURL(join(showcaseDirectory, htmlFile)).href);
  pageUrl.searchParams.set('depth', 'complex');
  const loaded = client.once('Page.loadEventFired', sessionId);
  await client.command('Page.navigate', { url: pageUrl.href }, sessionId);
  await loaded;
  await client.command('Runtime.evaluate', {
    expression: 'document.fonts.ready.then(() => new Promise(requestAnimationFrame))',
    awaitPromise: true,
  }, sessionId);

  const { result } = await client.command('Runtime.evaluate', {
    expression: `JSON.stringify({
      innerWidth,
      innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      depth: document.querySelector('.family-showcase')?.dataset.depth
    })`,
    returnByValue: true,
  }, sessionId);
  const metrics = JSON.parse(result.value);
  const overflow = metrics.scrollWidth > metrics.innerWidth;

  const { data } = await client.command('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  }, sessionId);
  const outputDirectory = profile.mobile ? join(screenshotDirectory, 'mobile') : screenshotDirectory;
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = join(outputDirectory, `${sampleName}-complex.png`);
  await writeFile(outputPath, Buffer.from(data, 'base64'));

  console.log(`${sampleName.padEnd(10)} ${profile.label.padEnd(7)} ${metrics.innerWidth}x${metrics.innerHeight} scroll=${metrics.scrollWidth}x${metrics.scrollHeight} overflow=${overflow ? 'FAIL' : 'pass'}`);
  if (overflow) process.exitCode = 1;
}

async function main() {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'ark-ui-edge-'));
  const { processHandle, webSocketUrl } = launchEdge(userDataDirectory);
  const client = new CdpClient(await webSocketUrl);

  try {
    await client.open();
    const { targetId, sessionId } = await createPage(client);
    for (const profile of profiles) {
      for (const [sampleName, htmlFile] of samples) {
        await capture(client, sessionId, sampleName, htmlFile, profile);
      }
    }
    await client.command('Target.closeTarget', { targetId });
  } finally {
    client.close();
    processHandle.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
