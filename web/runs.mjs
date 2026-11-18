import { randomUUID } from 'node:crypto';
import { executeExperiment, recordedEvents } from './runtime.mjs';

export class RunStore {
  constructor({ execute = executeExperiment, replay = recordedEvents, interval = 280, timeout = 65000 } = {}) {
    this.execute = execute; this.replay = replay; this.interval = interval; this.timeout = timeout;
    this.runs = new Map(); this.active = null;
  }
  describe(run) {
    return { id: run.id, mode: run.mode, experiment: run.experiment, status: run.status,
      startedAt: run.startedAt, count: run.events.length, result: run.result ?? null };
  }
  start({ mode, experiment }) {
    if (!['live', 'replay'].includes(mode) || !['first-task', 'plugins'].includes(experiment)) throw Object.assign(new Error('INVALID_EXPERIMENT'), { status: 400 });
    if (this.active) throw Object.assign(new Error('RUN_ACTIVE'), { status: 409, runId: this.active });
    while (this.runs.size >= 12) {
      const [id, old] = this.runs.entries().next().value;
      old.listeners.clear(); this.runs.delete(id);
    }
    const run = { id: randomUUID(), mode, experiment, startedAt: new Date().toISOString(), clock: performance.now(),
      status: 'running', events: [], listeners: new Set(), controller: new AbortController() };
    this.runs.set(run.id, run); this.active = run.id;
    run.done = this.drive(run);
    return this.describe(run);
  }
  append(run, kind, data) {
    if (run.events.length >= 1500 && kind !== 'complete') { run.controller.abort(new Error('OUTPUT_LIMIT')); return; }
    const event = { seq: run.events.length + 1, elapsedMs: Math.round(performance.now() - run.clock), kind, data };
    run.events.push(event);
    for (const fn of run.listeners) { try { fn(event); } catch { run.listeners.delete(fn); } }
  }
  async drive(run) {
    const timer = setTimeout(() => run.controller.abort(new Error('TIMEOUT')), this.timeout);
    timer.unref();
    let result;
    try {
      if (run.mode === 'replay') {
        for (const event of await this.replay(run.experiment)) {
          await new Promise((resolve, reject) => {
            const signal = run.controller.signal;
            if (signal.aborted) { reject(signal.reason); return; }
            const onAbort = () => { clearTimeout(tick); reject(signal.reason); };
            const tick = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, this.interval);
            signal.addEventListener('abort', onAbort, { once: true });
          });
          this.append(run, event.kind, event.data);
        }
        result = { validated: false, recordedEvidence: true };
      } else result = await this.execute(run.experiment, run.controller.signal, (kind, data) => this.append(run, kind, data));
      run.status = 'completed';
    } catch (error) {
      const reason = run.controller.signal.aborted ? run.controller.signal.reason?.message : error.message;
      run.status = reason === 'CANCELLED' ? 'cancelled' : 'failed';
      result = { code: reason || 'RUN_FAILED' };
    } finally {
      clearTimeout(timer); run.result = result;
      if (this.active === run.id) this.active = null;
      this.append(run, 'complete', { status: run.status, result });
    }
  }
  stop(id) {
    const run = this.runs.get(id);
    if (run?.status === 'running') run.controller.abort(new Error('CANCELLED'));
    return run ? this.describe(run) : null;
  }
  async close() {
    for (const run of this.runs.values()) this.stop(run.id);
    await Promise.all([...this.runs.values()].map(run => run.done));
  }
}
