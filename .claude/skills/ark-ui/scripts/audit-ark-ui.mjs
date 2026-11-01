#!/usr/bin/env node
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '.');
const supported = new Set(['.html', '.css', '.js', '.mjs', '.jsx', '.ts', '.tsx', '.vue', '.svelte']);

async function collect(path) {
  const info = await stat(path);
  if (info.isFile()) return supported.has(extname(path)) ? [path] : [];
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(entries
    .filter((entry) => !['node_modules', '.next', 'dist', 'build'].includes(entry.name))
    .map((entry) => collect(resolve(path, entry.name))));
  return nested.flat();
}

const files = await collect(root);
if (!files.length) {
  console.error(`No supported frontend files found at ${root}`);
  process.exit(2);
}

const records = await Promise.all(files.map(async (file) => ({ file, text: await readFile(file, 'utf8') })));
const all = records.map((record) => record.text).join('\n');
const html = records.filter((record) => extname(record.file) === '.html').map((record) => record.text).join('\n');
const css = records.filter((record) => extname(record.file) === '.css').map((record) => record.text).join('\n');
const js = records.filter((record) => ['.js', '.mjs'].includes(extname(record.file))).map((record) => record.text).join('\n');

const errors = [];
const warnings = [];
const passes = [];

function check(condition, pass, fail, severity = 'warning') {
  if (condition) passes.push(pass);
  else (severity === 'error' ? errors : warnings).push(fail);
}

function htmlHasSelector(selector) {
  const id = selector.match(/^#([\w-]+)/)?.[1];
  if (id) return new RegExp(`\\bid=["']${id}["']`).test(html);

  const className = selector.match(/^\.([\w-]+)/)?.[1];
  if (className) return new RegExp(`\\bclass=["'][^"']*\\b${className}\\b`).test(html);

  const attribute = selector.match(/^\[([\w-]+)(?:=["']([^"']+)["'])?\]$/);
  if (!attribute) return true;
  const [, name, value] = attribute;
  return value
    ? new RegExp(`\\b${name}=["']${value}["']`).test(html)
    : new RegExp(`\\b${name}(?:=["'][^"']*["'])?`).test(html);
}

const queriedSelectors = [...js.matchAll(/\bquerySelector(?:All)?\(\s*(["'])([^"']+)\1\s*\)/g)]
  .map((match) => match[2]);
const missingSelectors = [...new Set(queriedSelectors.filter((selector) => !htmlHasSelector(selector)))];

const referencedIds = [...html.matchAll(/\b(?:aria-controls|aria-labelledby|aria-describedby|for)=["']([^"']+)["']/g)]
  .flatMap((match) => match[1].trim().split(/\s+/));
const declaredIds = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]));
const missingIds = [...new Set(referencedIds.filter((id) => !declaredIds.has(id)))];

check(!/web(?:-ipv6)?\.hycdn\.cn|hypergryph\.com\/(?:.*\.(?:png|jpe?g|svg|woff2?|ttf|eot|mp4))/i.test(all),
  'No official CDN assets are embedded.',
  'Official Hypergryph CDN assets appear to be embedded; verify rights and replace with original/user-owned assets.', 'error');
check(!/(?:rhodes\s*island|arknights|endfield|monster\s*siren).{0,24}(?:logo|wordmark|copyright)/i.test(all),
  'No obvious protected brand-logo reference is present.',
  'A protected brand/logo reference may be present; confirm authorization.', 'error');
check(/--ark-(?:ink|paper|signal)/.test(css),
  'Semantic Ark color tokens are present.',
  'Use semantic ink, paper, and signal tokens instead of scattering palette literals.');
check(/prefers-reduced-motion/.test(css),
  'Reduced-motion behavior is defined.',
  'Add a prefers-reduced-motion rule for loops, transitions, and reveal effects.', 'error');
check(/@media[^{]*(?:max-width|orientation)/.test(css),
  'Responsive or orientation-specific rules are present.',
  'Add a portrait/mobile recomposition; do not rely on desktop scaling.', 'error');
check(/:focus-visible/.test(css),
  'Visible keyboard focus styling is present.',
  'Add an explicit visible :focus-visible treatment.', 'error');
check(!html || /<meta[^>]+name=["']viewport["']/i.test(html),
  'Viewport metadata is present.',
  'HTML is missing a viewport meta tag.', 'error');
check(!html || /<html[^>]+lang=/i.test(html),
  'Document language is declared.',
  'HTML is missing a lang attribute.', 'error');
check(!html || /<(?:main|nav|header|footer)\b/i.test(html),
  'Semantic landmarks are present.',
  'Use semantic main/nav/header/footer landmarks.', 'error');
check(!html || !js || missingSelectors.length === 0,
  'Literal JavaScript selectors have matching HTML hooks.',
  `JavaScript queries HTML hooks that were not found: ${missingSelectors.join(', ')}. Update copied starter wiring after renaming classes or IDs.`);
check(!html || missingIds.length === 0,
  'HTML ID references resolve.',
  `ARIA or label references point to missing IDs: ${missingIds.join(', ')}.`, 'error');
check(!/(?:scanline|glitch|random-hex|matrix-rain)/i.test(all),
  'No common sci-fi imitation cliché is named.',
  'A generic scanline/glitch/matrix cliché appears; keep it only if it has a real information role.');
check((all.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length < 180,
  'Literal color count is restrained.',
  'Many literal colors were found; consolidate them into family and semantic tokens.');

const report = { root, files: files.length, errors, warnings, passes };
console.log(JSON.stringify(report, null, 2));
process.exit(errors.length ? 1 : 0);
