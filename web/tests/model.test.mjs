import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { eventKey, sourceAssociation, pluginAssociation, stageIndex } from '../public/model.mjs';

const manifest = JSON.parse(await readFile(new URL('../sources/manifest.json', import.meta.url), 'utf8'));
test('second step maps to derivation with an explicit evidence boundary', () => {
  const event = { kind: 'data', data: { type: 'status', phase: 'step_start', step: 2 } };
  assert.equal(eventKey(event), 'step_start_2');
  const association = sourceAssociation(event, manifest.events, 'en');
  assert.equal(association.id, 'agent'); assert.ok(association.start > 0); assert.ok(association.boundary);
});
test('failed completion never implies the final stage was observed', () => {
  assert.equal(stageIndex({ kind: 'complete', data: { status: 'failed' } }, false), -1);
  assert.equal(stageIndex({ kind: 'complete', data: { status: 'cancelled' } }, true), -1);
});
test('plugin replacement points at the replacement rather than its first provider', async () => {
  const content = await readFile(new URL('../../labs/dsh/cordis-exercise.mjs', import.meta.url), 'utf8');
  const association = pluginAssociation('consumer after replacement: ACTIVE', content);
  const line = content.split('\n')[association.start - 1];
  assert.match(line, /^\s+await root.plugin/); assert.doesNotMatch(line, /const provider/);
});

test('step completion remains a model-stage fact, not a new input', () => {
  assert.equal(stageIndex({ kind: 'data', data: { type: 'status', phase: 'step_end', step: 2 } }, false), 1);
});
