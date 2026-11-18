import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { messages } from '../public/i18n.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const design = await readFile(join(root, 'DESIGN.md'), 'utf8');
const css = await readFile(join(root, 'web/public/tokens.css'), 'utf8');
const palette = design.split('colors:\n')[1].split('typography:')[0];
for (const match of palette.matchAll(/^  ([\w-]+): "(#[A-Fa-f0-9]{6})"$/gm)) {
  assert.ok(css.includes(`--color-${match[1]}: ${match[2]};`), `Token drift: ${match[1]}`);
}
function keys(object, prefix = '') {
  return Object.entries(object).flatMap(([key, value]) => typeof value === 'object' ? keys(value, `${prefix}${key}.`) : [`${prefix}${key}`]);
}
assert.deepEqual(keys(messages.zh).sort(), keys(messages.en).sort(), 'Locale dictionaries must have parity');
const html = await readFile(join(root, 'web/public/index.html'), 'utf8');
for (const match of html.matchAll(/data-i18n="([^"]+)"/g)) assert.ok(messages.zh[match[1]] && messages.en[match[1]], match[1]);
const files = await readdir(join(root, 'web/public'));
for (const file of files.filter(f => f.endsWith('.mjs'))) {
  const result = spawnSync(process.execPath, ['--check', join(root, 'web/public', file)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const source = await readFile(join(root, 'web/public', file), 'utf8');
  assert.ok(!/\.innerHTML\s*=|\b(?:alert|confirm|prompt)\s*\(/.test(source), `Unsafe product pattern: ${file}`);
}
const manifest = JSON.parse(await readFile(join(root, 'web/sources/manifest.json'), 'utf8'));
for (const file of manifest.files) {
  const content = await readFile(join(root, 'web/sources', file.snapshot), 'utf8');
  assert.equal(createHash('sha256').update(content).digest('hex'), file.sha256, file.path);
  for (const entry of manifest.events) for (const source of entry.sources.filter(s => s.file === file.path)) {
    assert.ok(source.startLine > 0 && source.endLine >= source.startLine && source.endLine <= content.split('\n').length);
  }
}
console.log('PASS: source integrity, teaching ranges, locale parity, token mapping, syntax and safe DOM rendering');
