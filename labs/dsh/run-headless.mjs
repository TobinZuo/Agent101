import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [major, minor] = process.versions.node.split('.').map(Number);
assert.ok(major > 24 || (major === 24 && minor >= 9), 'Node.js >=24.9.0 is required');
const lab = mkdtempSync(join(tmpdir(), 'agent101-first-task-'));
const workspace = join(lab, 'workspace');
cpSync(join(here, 'workspace'), workspace, { recursive: true });
const cli = join(dirname(fileURLToPath(import.meta.resolve('@deepseek-ai/dsh/package.json'))), 'lib/bin.js');

// Isolated homes prevent changes to the learner's normal DSH configuration.
// Keep workspace-write policy; 'never' rejects calls requiring human approval.
const result = spawnSync(process.execPath, [
  cli, 'headless', '--patch', join(here, 'first-task.patch.yml'),
  '--permission-mode', 'workspace-write', '--approval-policy', 'never',
  '--json', 'Read README.md and package.json. Do not change files or install dependencies.',
], {
  cwd: workspace,
  env: {
    ...process.env,
    PATH: `${dirname(process.execPath)}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
    DSH_HOME: join(lab, '.dsh'),
    DSH_AGENTS_HOME: join(lab, '.agents'),
    DSH_TELEMETRY_DISABLED: '1',
  },
  encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024,
});
writeFileSync(join(lab, 'events.jsonl'), result.stdout ?? '');
writeFileSync(join(lab, 'stderr.log'), result.stderr ?? '');
console.error(`Run artifacts: ${lab}`);
process.stdout.write(result.stdout ?? '');
if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stderr ?? '');
  throw new Error(`DSH exited with ${result.status}; inspect stderr.log`);
}
const events = result.stdout.trim().split('\n').map((line) => JSON.parse(line));
assert.equal(events[0].type, 'session');
const calls = events.filter((event) => event.type === 'tool_call');
const results = events.filter((event) => event.type === 'tool_result');
assert.equal(calls.length, 1);
assert.equal(results.length, 1);
assert.equal(results[0].callId, calls[0].callId);
assert.equal(results[0].status, 'completed');
assert.equal(results[0].error, undefined);
const final = events.at(-1);
assert.equal(final.type, 'final');
assert.equal(final.reason?.kind, 'completed');
assert.equal(events.filter((event) => event.type === 'status' && event.phase === 'turn_start').length, 1);
assert.equal(events.filter((event) => event.type === 'status' && event.phase === 'step_start').length, 2);
assert.equal(final.text, `Observed workspace files:\n${results[0].result.trim()}`);
assert.match(final.text, /agent101-dsh-fixture/);
for (const file of ['README.md', 'package.json']) {
  const contents = readFileSync(join(here, 'workspace', file), 'utf8').trim();
  assert.ok(results[0].result.includes(contents), `Tool result must include full ${file}`);
  assert.ok(final.text.includes(contents), `Final text must include full ${file}`);
}
assert.match(result.stderr, /agent101-mock: request=1; lastRole=user/);
assert.match(result.stderr, /agent101-mock: request=2; lastRole=tool/);
assert.equal((result.stderr.match(/agent101-mock: request=/g) ?? []).length, 2);
for (const file of ['README.md', 'package.json', 'server.mjs']) {
  assert.equal(readFileSync(join(workspace, file), 'utf8'), readFileSync(join(here, 'workspace', file), 'utf8'));
}
console.error('PASS: real DSH tool round trip completed; fixture files unchanged');
