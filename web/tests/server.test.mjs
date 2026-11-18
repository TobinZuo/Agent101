import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { get } from 'node:http';
import { createApp } from '../server.mjs';
import { RunStore } from '../runs.mjs';

async function setup(t, options = {}) {
  const store = new RunStore({ interval: 1, execute: async (_experiment, _signal, emit) => {
    emit('data', { type: 'session', sessionId: 'test' }); return { validated: true, exitCode: 0 };
  }, ...options });
  const app = createApp({ store, available: () => options.ready !== false });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const meta = await (await fetch(`${base}/api/meta`)).json();
  const headers = { 'Content-Type': 'application/json', 'X-Agent101-Token': meta.token };
  const post = (path, body, override = {}) => fetch(`${base}${path}`, { method: 'POST', headers: { ...headers, ...override }, body: JSON.stringify(body) });
  return { app, store, base, meta, post, headers };
}

test('serves the app, real pinned source and CSP without arbitrary filesystem reads', async t => {
  const { base, meta } = await setup(t);
  const page = await fetch(base); assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(await page.text(), /source-lines/);
  const source = await (await fetch(`${base}/api/sources/agent`)).json();
  assert.match(source.content, /class ReactLoopAgent/);
  assert.equal(source.revision, meta.revision); assert.match(source.checksum, /^[a-f0-9]{64}$/);
  assert.equal((await fetch(`${base}/api/sources/not-allowed`)).status, 404);
  assert.equal((await fetch(`${base}/package.json`)).status, 404);
  const status = await new Promise((resolve, reject) => {
    get(`${base}/api/meta`, { headers: { Host: 'untrusted.example' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
  });
  assert.equal(status, 403);
});

test('rejects foreign origins, missing token, invalid bodies and arbitrary experiments', async t => {
  const { base, post, headers } = await setup(t);
  assert.equal((await fetch(`${base}/api/runs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await post('/api/runs', {}, { Origin: 'https://foreign.example' })).status, 403);
  assert.equal((await post('/api/runs', {}, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post('/api/runs', { mode: 'live', experiment: 'rm -rf /' })).status, 400);
  assert.equal((await post('/api/runs', null)).status, 400);
  assert.equal((await fetch(`${base}/api/runs`, { method: 'POST', headers, body: '{' })).status, 400);
  assert.equal((await post('/api/runs', { padding: 'x'.repeat(2100) })).status, 413);
});

test('streams actual stored events and resumes by cursor without re-executing', async t => {
  let executions = 0;
  const { post, base } = await setup(t, { execute: async (_experiment, _signal, emit) => {
    executions++; emit('data', { type: 'session', sessionId: 'real-event' }); emit('diagnostic', { text: 'actual diagnostic' }); return { validated: true };
  } });
  const response = await post('/api/runs', { mode: 'live', experiment: 'first-task' }); assert.equal(response.status, 201);
  const run = await response.json();
  const stream = await (await fetch(`${base}/api/runs/${run.id}/events`)).text();
  assert.match(stream, /real-event/); assert.match(stream, /actual diagnostic/); assert.match(stream, /"kind":"complete"/);
  const resumed = await (await fetch(`${base}/api/runs/${run.id}/events?after=2`)).text();
  assert.doesNotMatch(resumed, /real-event/); assert.match(resumed, /id: 3/); assert.equal(executions, 1);
});

test('single active run, cancellation and unknown run are explicit', async t => {
  const { post, base, store } = await setup(t, { execute: async (_experiment, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) });
  const run = await (await post('/api/runs', { mode: 'live', experiment: 'plugins' })).json();
  assert.equal((await post('/api/runs', { mode: 'replay', experiment: 'first-task' })).status, 409);
  assert.equal((await post(`/api/runs/${run.id}/stop`, {})).status, 200);
  await store.runs.get(run.id).done;
  assert.equal((await (await fetch(`${base}/api/runs/${run.id}`)).json()).status, 'cancelled');
  assert.equal(store.active, null);
  assert.equal((await fetch(`${base}/api/runs/00000000-0000-0000-0000-000000000000`)).status, 404);
});

test('missing runtime blocks live but verified replay remains usable', async t => {
  const { post, store } = await setup(t, { ready: false });
  assert.equal((await post('/api/runs', { mode: 'live', experiment: 'first-task' })).status, 503);
  const run = await (await post('/api/runs', { mode: 'replay', experiment: 'first-task' })).json();
  await store.runs.get(run.id).done;
  const stored = store.runs.get(run.id);
  assert.equal(stored.status, 'completed'); assert.equal(stored.result.recordedEvidence, true);
  assert.equal(stored.result.validated, false);
  assert.ok(stored.events.some(e => e.data.type === 'tool_result'));
});

test('failed execution never reports validated completion; timeout releases the slot', async t => {
  const { store } = await setup(t, { timeout: 25, execute: async (_experiment, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) });
  const run = store.start({ mode: 'live', experiment: 'plugins' });
  await store.runs.get(run.id).done;
  assert.equal(store.runs.get(run.id).status, 'failed');
  assert.equal(store.runs.get(run.id).result.code, 'TIMEOUT'); assert.equal(store.active, null);
});
