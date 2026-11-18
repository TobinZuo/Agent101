import http from 'node:http';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RunStore } from './runs.mjs';
import { ROOT, runtimeAvailable } from './runtime.mjs';

const WEB = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(join(WEB, 'sources/manifest.json'), 'utf8'));
const sourceFiles = [
  ...manifest.files.map(f => ({ ...f, id: f.snapshot.replace('.ts', ''), file: join(WEB, 'sources', f.snapshot), revision: manifest.revision })),
  { id: 'mock', path: 'labs/dsh/mock-llm.mjs', file: join(ROOT, 'labs/dsh/mock-llm.mjs'), revision: 'Agent101' },
  { id: 'plugins', path: 'labs/dsh/cordis-exercise.mjs', file: join(ROOT, 'labs/dsh/cordis-exercise.mjs'), revision: 'Agent101' },
  { id: 'runtime', path: 'web/runtime.mjs', file: join(WEB, 'runtime.mjs'), revision: 'Agent101' },
  { id: 'run-store', path: 'web/runs.mjs', file: join(WEB, 'runs.mjs'), revision: 'Agent101' },
];
const assets = new Map(['index.html', 'app.css', 'tokens.css', 'app.mjs', 'i18n.mjs', 'model.mjs'].map(f => [`/${f}`, join(WEB, 'public', f)]));
const types = { html: 'text/html', css: 'text/css', mjs: 'text/javascript' };

export function createApp({ store = new RunStore(), available = runtimeAvailable } = {}) {
  const token = randomBytes(24).toString('hex');
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'");
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      const port = server.address()?.port;
      const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!allowedHosts.includes(req.headers.host)) { json(403, { code: 'HOST_DENIED' }); return; }
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (!['GET', 'HEAD'].includes(req.method)) {
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) { json(403, { code: 'ORIGIN_DENIED' }); return; }
        const supplied = Buffer.from(req.headers['x-agent101-token'] ?? '');
        const expected = Buffer.from(token);
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { json(403, { code: 'TOKEN_REQUIRED' }); return; }
        if (!req.headers['content-type']?.startsWith('application/json')) { json(415, { code: 'JSON_REQUIRED' }); return; }
      }
      if (req.method === 'GET' && url.pathname === '/api/meta') {
        json(200, { token, ready: available(), activeRun: store.active, revision: manifest.revision,
          sourceFiles: sourceFiles.map(({ file, ...f }) => f), teachingMap: manifest.events, evidenceDate: '2026-11-18' }); return;
      }
      if (req.method === 'GET' && url.pathname.startsWith('/api/sources/')) {
        const source = sourceFiles.find(f => f.id === url.pathname.slice('/api/sources/'.length));
        if (!source) { json(404, { code: 'SOURCE_NOT_FOUND' }); return; }
        const content = await readFile(source.file, 'utf8');
        const { file, ...info } = source;
        json(200, { ...info, content, checksum: createHash('sha256').update(content).digest('hex') }); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/runs') {
        let body = '';
        for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 2048) throw Object.assign(new Error('BODY_TOO_LARGE'), { status: 413 }); }
        let request;
        try { request = JSON.parse(body); } catch { throw Object.assign(new Error('INVALID_JSON'), { status: 400 }); }
        if (!request || typeof request !== 'object' || Array.isArray(request)) { json(400, { code: 'INVALID_EXPERIMENT' }); return; }
        if (request.mode === 'live' && !available()) { json(503, { code: 'RUNTIME_MISSING' }); return; }
        json(201, store.start(request)); return;
      }
      const match = /^\/api\/runs\/([0-9a-f-]{36})(\/events|\/stop)?$/.exec(url.pathname);
      if (match) {
        const run = store.runs.get(match[1]);
        if (!run) { json(404, { code: 'RUN_NOT_FOUND' }); return; }
        if (req.method === 'GET' && !match[2]) { json(200, store.describe(run)); return; }
        if (req.method === 'POST' && match[2] === '/stop') { json(200, store.stop(run.id)); return; }
        if (req.method === 'GET' && match[2] === '/events') {
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
          let cursor = Number(req.headers['last-event-id'] ?? url.searchParams.get('after') ?? 0);
          if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > run.events.length) cursor = 0;
          const send = event => {
            if (event.seq <= cursor) return;
            cursor = event.seq;
            res.write(`id: ${event.seq}\nevent: update\ndata: ${JSON.stringify(event)}\n\n`);
            if (event.kind === 'complete') res.end();
          };
          for (const event of run.events) send(event);
          if (run.status !== 'running') { res.end(); return; }
          run.listeners.add(send);
          const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);
          req.on('close', () => { clearInterval(heartbeat); run.listeners.delete(send); });
          return;
        }
      }
      if (req.method === 'GET' && (url.pathname === '/' || assets.has(url.pathname))) {
        const name = url.pathname === '/' ? '/index.html' : url.pathname;
        const content = await readFile(assets.get(name));
        res.writeHead(200, { 'Content-Type': `${types[name.split('.').at(-1)]}; charset=utf-8`, 'Cache-Control': 'no-cache' }); res.end(content); return;
      }
      json(404, { code: 'NOT_FOUND' });
    } catch (error) {
      if (!res.headersSent) json(error.status ?? 500, { code: error.status ? error.message : 'SERVER_ERROR', ...(error.runId ? { runId: error.runId } : {}) });
      else res.end();
    }
  });
  return { server, store, async close() { await store.close(); await new Promise(resolve => server.close(resolve)); } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 24 || (major === 24 && minor < 9)) { console.error('Agent101 requires Node.js >=24.9.0'); process.exit(1); }
  const port = Number(process.env.PORT ?? 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1–65535');
  const app = createApp();
  app.server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use. Choose another PORT.` : error.message); process.exitCode = 1; });
  app.server.listen(port, '127.0.0.1', () => console.log(`Agent101 Observatory · http://127.0.0.1:${port}`));
  let closing = false;
  const shutdown = async () => { if (closing) return; closing = true; await app.close(); };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
}
