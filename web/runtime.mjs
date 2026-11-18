import { spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, delimiter } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const LAB = join(ROOT, 'labs/dsh');
const requireLab = createRequire(join(LAB, 'package.json'));

export function runtimeAvailable() {
  try {
    requireLab.resolve('@deepseek-ai/dsh/package.json');
    requireLab.resolve('@deepseek-ai/cordis');
    return true;
  } catch { return false; }
}

export async function recordedEvents(experiment) {
  if (experiment === 'plugins') {
    const text = await readFile(join(LAB, 'evidence/cordis.stdout.txt'), 'utf8');
    return text.trim().split('\n').map(message => ({ kind: 'data', data: { type: 'plugin_event', message } }));
  }
  const text = await readFile(join(LAB, 'evidence/first-task.events.jsonl'), 'utf8');
  return text.trim().split('\n').map(line => ({ kind: 'data', data: JSON.parse(line) }));
}

export async function executeExperiment(experiment, signal, emit) {
  if (!runtimeAvailable()) throw new Error('RUNTIME_MISSING');
  const directory = await mkdtemp(join(tmpdir(), 'agent101-web-'));
  const cwd = join(directory, 'workspace');
  await cp(join(LAB, 'workspace'), cwd, { recursive: true });
  signal.throwIfAborted();
  const args = experiment === 'plugins'
    ? [join(LAB, 'cordis-runtime-demo.mjs')]
    : [join(dirname(requireLab.resolve('@deepseek-ai/dsh/package.json')), 'lib/bin.js'),
      'headless', '--patch', join(LAB, 'first-task.patch.yml'),
      '--permission-mode', 'workspace-write', '--approval-policy', 'never', '--json',
      'Read README.md and package.json. Do not change files or install dependencies.'];
  const child = spawn(process.execPath, args, {
    cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    env: { ...process.env, PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ''}`,
      DSH_HOME: join(directory, '.dsh'), DSH_AGENTS_HOME: join(directory, '.agents'), DSH_TELEMETRY_DISABLED: '1' },
  });
  const events = [];
  const raw = { stdout: '', stderr: '' };
  let killer;
  const abort = () => {
    child.kill('SIGINT');
    killer = setTimeout(() => child.kill('SIGKILL'), 2000);
    killer.unref();
  };
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  let outputBytes = 0;
  function observe(stream, key) {
    let pending = '';
    function flush(line) {
      if (!line) return;
      if (key === 'stdout') {
        try {
          const data = JSON.parse(line);
          events.push(data);
          emit('data', data);
          return;
        } catch { /* Non-JSON child output stays visible as diagnostic evidence. */ }
      }
      emit('diagnostic', { stream: key, text: line.slice(0, 8192) });
    }
    stream.setEncoding('utf8');
    stream.on('data', chunk => {
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > 1024 * 1024) { child.kill('SIGKILL'); return; }
      raw[key] += chunk;
      pending += chunk;
      let offset;
      while ((offset = pending.indexOf('\n')) >= 0) {
        flush(pending.slice(0, offset)); pending = pending.slice(offset + 1);
      }
    });
    stream.on('end', () => flush(pending));
  }
  observe(child.stdout, 'stdout'); observe(child.stderr, 'stderr');
  let code;
  try {
    code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
  } finally {
    clearTimeout(killer);
    signal.removeEventListener('abort', abort);
    await Promise.all([
      writeFile(join(directory, 'events.jsonl'), raw.stdout),
      writeFile(join(directory, 'stderr.log'), raw.stderr),
    ]);
  }
  if (signal.aborted) throw signal.reason;
  if (outputBytes > 1024 * 1024) throw new Error('OUTPUT_LIMIT');
  if (code !== 0) throw new Error('PROCESS_FAILED');
  if (experiment === 'plugins') {
    if (!events.at(-1)?.message?.startsWith('PASS:')) throw new Error('VALIDATION_FAILED');
  } else {
    const final = events.at(-1);
    const calls = events.filter(e => e.type === 'tool_call');
    const results = events.filter(e => e.type === 'tool_result');
    if (final?.type !== 'final' || final.reason?.kind !== 'completed' || calls.length !== 1 || results.length !== 1
      || results[0].status !== 'completed' || results[0].error || results[0].callId !== calls[0].callId) throw new Error('VALIDATION_FAILED');
    for (const name of ['README.md', 'package.json', 'server.mjs']) {
      const original = await readFile(join(LAB, 'workspace', name), 'utf8');
      if (original !== await readFile(join(cwd, name), 'utf8')) throw new Error('FIXTURE_CHANGED');
      if (name !== 'server.mjs' && (!results[0].result.includes(original.trim()) || !final.text.includes(original.trim()))) throw new Error('VALIDATION_FAILED');
    }
  }
  return { exitCode: code, validated: true, artifacts: directory };
}
