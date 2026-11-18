import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { createApp } from '../server.mjs';

const app = createApp();
app.server.listen(0, '127.0.0.1');
await once(app.server, 'listening');
const base = `http://127.0.0.1:${app.server.address().port}`;
const meta = await (await fetch(`${base}/api/meta`)).json();
const headers = { 'Content-Type': 'application/json', 'X-Agent101-Token': meta.token };
const checks = [];
async function run(mode, experiment) {
  const response = await fetch(`${base}/api/runs`, { method: 'POST', headers, body: JSON.stringify({ mode, experiment }) });
  assert.equal(response.status, 201);
  const descriptor = await response.json();
  const stream = await (await fetch(`${base}/api/runs/${descriptor.id}/events`)).text();
  const events = stream.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
  assert.equal(events.at(-1).data.status, 'completed', JSON.stringify(events.at(-1)));
  assert.deepEqual(events.map(e => e.seq), events.map((_, i) => i + 1));
  const completion = events.at(-1).data.result;
  assert.equal(completion.validated, mode === 'live');
  if (mode === 'replay') assert.equal(completion.recordedEvidence, true);
  if (mode === 'live' && experiment === 'first-task') {
    assert.equal(events.filter(e => e.data.type === 'tool_call').length, 1);
    assert.equal(events.filter(e => e.data.type === 'tool_result').length, 1);
    assert.equal(events.filter(e => e.kind === 'diagnostic').length, 2);
    for (const name of ['README.md', 'package.json']) {
      const content = (await readFile(new URL(`../../labs/dsh/workspace/${name}`, import.meta.url), 'utf8')).trim();
      assert.ok(events.find(e => e.data.type === 'tool_result').data.result.includes(content));
      assert.ok(events.find(e => e.data.type === 'final').data.text.includes(content));
    }
  }
  if (mode === 'live' && experiment === 'plugins') {
    assert.equal(events.filter(e => e.data.type === 'plugin_event').length, 12);
    assert.match(events.at(-2).data.message, /^PASS:/);
  }
  checks.push({ mode, experiment, status: 'completed', validated: completion.validated,
    recordedEvidence: completion.recordedEvidence ?? false, eventCount: events.length,
    diagnostics: events.filter(e => e.kind === 'diagnostic').length, durationMs: events.at(-1).elapsedMs });
}
async function cancelLiveRun() {
  const response = await fetch(`${base}/api/runs`, { method: 'POST', headers,
    body: JSON.stringify({ mode: 'live', experiment: 'first-task' }) });
  assert.equal(response.status, 201);
  const descriptor = await response.json();
  const reader = (await fetch(`${base}/api/runs/${descriptor.id}/events`)).body.getReader();
  const decoder = new TextDecoder();
  let evidence = '', stopped = false;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    evidence += decoder.decode(value, { stream: true });
    if (!stopped && evidence.includes('event: update')) {
      stopped = true;
      assert.equal((await fetch(`${base}/api/runs/${descriptor.id}/stop`, { method: 'POST', headers, body: '{}' })).status, 200);
    }
  }
  assert.equal(stopped, true, 'Wait for actual child output before requesting cancellation');
  const result = await (await fetch(`${base}/api/runs/${descriptor.id}`)).json();
  assert.equal(result.status, 'cancelled');
  assert.equal(result.result.code, 'CANCELLED');
  checks.push({ mode: 'live', experiment: 'first-task', status: 'cancelled',
    code: result.result.code, eventCount: result.count, cancellationRequestedAfterChildOutput: true });
}
try {
  assert.equal(meta.ready, true, 'Install the lab runtime with npm run setup first.');
  await run('live', 'first-task');
  await run('live', 'plugins');
  await run('replay', 'first-task');
  await cancelLiveRun();
  const result = { checkedAt: new Date().toISOString(), node: process.version, platform: process.platform,
    architecture: process.arch, sourceRevision: meta.revision, checks,
    limitations: ['Fixed local model adapter; no remote model request', 'One execution per scenario, not a reliability benchmark',
      'Source associations are teaching mappings, not instrumentation', 'Other operating systems were not executed in this verification'] };
  await writeFile(new URL('../evidence/runtime-verification.json', import.meta.url), `${JSON.stringify(result, null, 2)}\n`);
  console.log('PASS: real DSH, real Cordis, unvalidated replay and live-process cancellation; evidence saved.');
} finally { await app.close(); }
