#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const skillDirectory = dirname(scriptDirectory);
const promoDirectory = join(skillDirectory, 'assets', 'promo');
const outputDirectory = join(promoDirectory, 'output');
const promoPage = pathToFileURL(join(promoDirectory, 'promo.html'));
const edgeBinary = process.env.ARK_UI_EDGE_BIN || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';

const jobs = [
  ['01-cover-landscape.png', 'cover', 'landscape', 1600, 900],
  ['02-families-landscape.png', 'families', 'landscape', 1600, 900],
  ['03-depth-landscape.png', 'depth', 'landscape', 1600, 900],
  ['04-responsive-landscape.png', 'responsive', 'landscape', 1600, 900],
  ['05-cover-portrait.png', 'cover', 'portrait', 1080, 1350],
  ['06-families-portrait.png', 'families', 'portrait', 1080, 1350],
  ['07-depth-portrait.png', 'depth', 'portrait', 1080, 1350],
  ['08-responsive-portrait.png', 'responsive', 'portrait', 1080, 1350],
];

function runEdge(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(edgeBinary, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(stderr);
      else reject(new Error(`Edge exited with code ${code}: ${stderr}`));
    });
  });
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  for (const [fileName, scene, format, width, height] of jobs) {
    const url = new URL(promoPage.href);
    url.searchParams.set('scene', scene);
    url.searchParams.set('format', format);
    const outputPath = join(outputDirectory, fileName);
    await runEdge([
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--run-all-compositor-stages-before-draw',
      '--virtual-time-budget=1200',
      `--window-size=${width},${height}`,
      `--screenshot=${outputPath}`,
      url.href,
    ]);
    console.log(`${fileName.padEnd(32)} ${width}x${height}`);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
