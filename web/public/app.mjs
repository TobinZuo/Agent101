import { messages } from './i18n.mjs';
import { eventKey, sourceAssociation, pluginAssociation, stageIndex } from './model.mjs';

const $ = id => document.getElementById(id);
const query = new URLSearchParams(location.search);
let restoreRunId = query.get('run');
let savedLanguage;
try { savedLanguage = localStorage.getItem('agent101-language'); } catch { /* Storage is optional. */ }
const state = {
  lang: query.get('lang') === 'en' || (!query.get('lang') && savedLanguage === 'en') ? 'en' : 'zh',
  lesson: ['start', 'execution', 'plugins'].includes(query.get('lesson')) ? query.get('lesson') : 'execution',
  mode: 'live', meta: null, run: null, events: [], selected: -1, follow: true,
  filter: 'all', busy: false, source: null, sourceRequest: 0, sourceCache: new Map(), nodes: new Map(),
};
let stream, reconnectTimer, sourceController;
const t = key => messages[state.lang][key] ?? key;
const lesson = () => t('lessons')[state.lesson];
const experiment = () => state.lesson === 'plugins' ? 'plugins' : 'first-task';
const running = () => state.run?.status === 'running';
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
function icon(name) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.classList.add('icon'); node.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(node.namespaceURI, 'use');
  use.setAttribute('href', `#i-${name}`); node.append(use); return node;
}
function updateURL(push = false) {
  const url = new URL(location.href);
  url.searchParams.set('lang', state.lang); url.searchParams.set('lesson', state.lesson);
  if (state.run) url.searchParams.set('run', state.run.id); else url.searchParams.delete('run');
  if (push) history.pushState(null, '', url); else history.replaceState(null, '', url);
}
function notice(key = '', actionLabel, action, error = false) {
  $('notice-text').textContent = key ? t(key) : '';
  $('notice').classList.toggle('is-error', error);
  $('notice-action').hidden = !action;
  $('notice-action').disabled = !action;
  $('notice-action').textContent = actionLabel ? t(actionLabel) : '';
  $('notice-action').onclick = action ?? null;
}
async function api(path, { method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(path, { method, signal: controller.signal,
      headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-Agent101-Token': state.meta?.token ?? '' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.code), data);
    return data;
  } finally { clearTimeout(timeout); }
}
function elapsed(ms) {
  return `${new Intl.NumberFormat(state.lang === 'zh' ? 'zh-CN' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(ms / 1000)}s`;
}
function statusText() {
  if (state.busy) return t('starting');
  if (!state.run) return t('idle');
  if (state.run.status === 'running') return t(state.run.mode === 'replay' ? 'playing' : 'running');
  return t(state.run.status === 'completed' && state.run.mode === 'replay' ? 'replayCompleted' : state.run.status);
}
function renderControls() {
  $('start').disabled = state.busy || running() || !state.meta || (state.mode === 'live' && !state.meta.ready);
  $('start').classList.toggle('is-busy', state.busy || running());
  $('start').setAttribute('aria-busy', String(state.busy));
  $('start').querySelector('span').textContent = state.busy ? t('starting') : t('start');
  $('stop').disabled = !running();
  $('export').disabled = state.events.length === 0;
  document.querySelectorAll('[data-mode]').forEach(node => {
    node.setAttribute('aria-pressed', String(node.dataset.mode === state.mode)); node.disabled = running() || state.busy;
  });
  $('mode-explanation').textContent = t(state.mode === 'live' ? 'liveExplanation' : 'replayExplanation');
  $('run-status').textContent = statusText();
  $('environment-label').textContent = t(!state.meta ? 'checking' : state.meta.ready ? 'ready' : 'missing');
  $('environment-dot').classList.toggle('unavailable', !state.meta?.ready);
  $('follow').setAttribute('aria-pressed', String(state.follow));
}
function renderLesson() {
  const l = lesson();
  document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';
  document.title = `${l.label} · Agent101`;
  document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
  $('language').querySelector('span').textContent = state.lang === 'zh' ? 'English' : '简体中文';
  $('language').setAttribute('aria-label', state.lang === 'zh' ? 'Switch to English' : '切换到简体中文');
  $('lesson-nav').setAttribute('aria-label', t('learningPath'));
  $('previous').setAttribute('aria-label', state.lang === 'zh' ? '上一个事件' : 'Previous event');
  $('next').setAttribute('aria-label', state.lang === 'zh' ? '下一个事件' : 'Next event');
  $('mode-group').setAttribute('aria-label', state.lang === 'zh' ? '运行方式' : 'Run mode');
  $('code-scroll').setAttribute('aria-label', t('source'));
  $('lesson-nav').replaceChildren();
  ['start', 'execution', 'plugins'].forEach((id, index) => {
    const a = el('a', 'lesson-link'); a.href = `?lesson=${id}&lang=${state.lang}`;
    if (id === state.lesson) a.setAttribute('aria-current', 'page');
    a.append(el('span', 'lesson-number', `0${index + 1}`), el('span', '', t('lessons')[id].label), icon('chevron'));
    a.addEventListener('click', event => { event.preventDefault(); changeLesson(id); });
    $('lesson-nav').append(a);
  });
  $('lesson-eyebrow').textContent = l.eyebrow; $('lesson-title').textContent = l.title;
  $('lesson-description').textContent = l.description; $('task-title').textContent = l.task;
  $('task-command').textContent = l.command; $('question-title').textContent = l.question; $('question-copy').textContent = l.copy;
  $('tutorial-link').href = `https://github.com/TobinZuo/Agent101/blob/master/notes/dsh/${l.file}`;
  $('overview-link').href = `https://github.com/TobinZuo/Agent101/blob/master/notes/dsh/00-harness-and-agent-loop${state.lang === 'en' ? '.en' : ''}.md`;
  state.nodes.clear(); $('events').replaceChildren();
  if (!state.events.length) {
    $('event-explanation').textContent = t('sourceIntro'); $('evidence-boundary').textContent = t(state.lesson === 'plugins' ? 'pluginBoundary' : 'boundaryIntro');
    $('raw-json').textContent = t('rawEmpty');
  }
  document.querySelector('[data-i18n="emptyText"]').textContent = t(state.lesson === 'plugins' ? 'emptyPluginText' : 'emptyText');
  document.querySelectorAll('.empty-tags code').forEach((node, i) => { node.textContent = state.lesson === 'plugins' ? ['PENDING', 'ACTIVE'][i] : ['turn/start', 'tool/result'][i]; });
  renderControls(); renderEvents(); renderStages(); renderResult(); updateURL();
  if (state.selected >= 0) explainSelected();
}
function clearRun() {
  stream?.close(); clearTimeout(reconnectTimer);
  state.run = null; state.events = []; state.selected = -1; state.follow = true;
  state.nodes.clear(); $('events').replaceChildren(); $('function-name').textContent = '';
  $('raw-type').textContent = ''; $('raw-json').textContent = t('rawEmpty');
}
function changeLesson(id) {
  if (running() && (id === 'plugins') !== (state.lesson === 'plugins')) {
    notice('activeRun', undefined, undefined, true); return;
  }
  if ((id === 'plugins') !== (state.lesson === 'plugins')) clearRun();
  state.lesson = id; updateURL(true); notice(); renderLesson();
  if (!state.events.length) loadSource(id === 'plugins' ? 'plugins' : 'agent', () => ({ start: id === 'plugins' ? 9 : 174, end: id === 'plugins' ? 26 : 189 }));
}
function colorLine(text) {
  const fragment = document.createDocumentFragment();
  const tokens = /\/\/.*$|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\b(?:const|let|return|await|async|function|class|export|import|from|if|else|try|catch|finally|throw|new|private|this|for|while|true|false|undefined)\b/g;
  let offset = 0;
  for (const match of text.matchAll(tokens)) {
    fragment.append(document.createTextNode(text.slice(offset, match.index)));
    fragment.append(el('span', match[0].startsWith('//') ? 'token-comment' : /^["']/.test(match[0]) ? 'token-string' : 'token-keyword', match[0]));
    offset = match.index + match[0].length;
  }
  fragment.append(document.createTextNode(text.slice(offset))); return fragment;
}
async function loadSource(id, range) {
  if (!state.meta) return;
  sourceController?.abort(); sourceController = new AbortController();
  const version = ++state.sourceRequest;
  $('code-scroll').setAttribute('aria-busy', 'true');
  $('source-revision').textContent = t('sourceLoading');
  try {
    let source = state.sourceCache.get(id);
    if (!source) {
      const timeout = setTimeout(() => sourceController.abort(), 10000);
      try {
        const response = await fetch(`/api/sources/${encodeURIComponent(id)}`, { signal: sourceController.signal });
        if (!response.ok) throw new Error('SOURCE_NOT_FOUND');
        source = await response.json(); state.sourceCache.set(id, source);
      } finally { clearTimeout(timeout); }
    }
    if (version !== state.sourceRequest) return;
    state.source = source; $('source-file').value = id;
    $('source-revision').textContent = source.revision === 'Agent101' ? 'Agent101' : source.revision.slice(0, 7);
    $('source-link').href = source.url ?? `https://github.com/TobinZuo/Agent101/blob/master/${source.path}`;
    const selection = range?.(source) ?? { start: 1, end: 1 };
    const fragment = document.createDocumentFragment();
    source.content.split('\n').forEach((line, index) => {
      const row = el('span', `code-line${index + 1 >= selection.start && index + 1 <= selection.end ? ' active' : ''}`);
      row.dataset.line = index + 1;
      const number = el('span', 'line-number', String(index + 1)); number.setAttribute('aria-hidden', 'true');
      row.append(number, colorLine(line || ' ')); fragment.append(row);
    });
    $('source-lines').replaceChildren(fragment);
    const selected = $('source-lines').querySelector('.active');
    if (selected) $('code-scroll').scrollTop = Math.max(0, selected.offsetTop - $('code-scroll').clientHeight * .25);
  } catch (error) {
    if (version === state.sourceRequest) notice('sourceError', 'retrySource', () => loadSource(id, range), true);
  } finally {
    if (version === state.sourceRequest) $('code-scroll').setAttribute('aria-busy', 'false');
  }
}
function labelEvent(event) {
  const d = event.data;
  if (event.kind === 'diagnostic') return t('diagnostic');
  if (event.kind === 'complete') return t('complete');
  if (d.type === 'plugin_event') return d.message;
  const label = t(d.phase ?? d.type);
  return d.phase?.startsWith('step_') ? `${label} ${d.step}` : label;
}
function renderEvents() {
  $('event-count').textContent = state.events.length;
  $('empty-events').hidden = state.events.length > 0;
  let visible = 0;
  state.events.forEach((event, index) => {
    let li = state.nodes.get(event.seq);
    if (!li) {
      li = el('li'); const button = el('button', 'event-button'); button.type = 'button'; button.dataset.seq = event.seq;
      button.append(el('span', 'event-marker', String(event.seq).padStart(2, '0')));
      const content = el('span', 'event-content');
      content.append(el('strong', '', labelEvent(event)), el('code', '', event.kind === 'data' ? event.data.phase ?? event.data.type : event.kind));
      button.append(content, el('span', 'event-time', elapsed(event.elapsedMs)));
      button.addEventListener('click', () => selectEvent(index)); li.append(button);
      state.nodes.set(event.seq, li); $('events').append(li);
    }
    li.hidden = state.filter === 'diagnostic' && event.kind !== 'diagnostic';
    if (!li.hidden) visible++;
    li.querySelector('button').setAttribute('aria-pressed', String(index === state.selected));
  });
  $('no-filter-results').hidden = state.events.length === 0 || visible > 0;
  $('selected-count').textContent = state.selected >= 0 ? `${t('selected')} ${state.selected + 1} / ${state.events.length}` : t('noEvent');
  $('previous').disabled = state.selected <= 0; $('next').disabled = state.selected >= state.events.length - 1;
  $('follow').setAttribute('aria-pressed', String(state.follow));
  document.querySelectorAll('[data-filter]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.filter === state.filter)));
  if (state.follow && state.events.length) $('event-scroll').scrollTop = $('event-scroll').scrollHeight;
  renderClock();
}
function renderClock() {
  if (!state.run) { $('elapsed').textContent = ''; return; }
  const value = state.events.at(-1)?.elapsedMs ?? 0;
  $('elapsed').textContent = `${t(state.run.mode === 'replay' ? 'playback' : 'elapsed')} ${elapsed(value)}`;
}
function renderStages() {
  const plugins = experiment() === 'plugins';
  const labels = plugins ? ['pluginWait', 'pluginActive', 'pluginCleanup', 'pluginReload'] : ['stageInput', 'stageModel', 'stageTool', 'stageResult'];
  const data = state.events.filter(e => e.kind === 'data');
  const current = state.selected >= 0 ? stageIndex(state.events[state.selected], plugins) : -1;
  $('stages').replaceChildren();
  labels.forEach((label, index) => {
    const matches = data.filter(event => stageIndex(event, plugins) === index);
    const li = el('li', `stage${matches.length ? ' observed' : ''}${current === index ? ' current' : ''}`);
    const button = el('button'); button.type = 'button'; button.disabled = !matches.length;
    const circle = el('span', 'stage-circle', `0${index + 1}`);
    const copy = el('span', 'stage-copy'); copy.append(el('strong', '', t(label)), el('small', '', t(matches.length ? 'stageObserved' : 'stagePending')));
    const representative = plugins && index === 3
      ? matches.find(event => event.data.message?.includes('consumer after replacement:')) ?? matches.at(-1)
      : matches.at(-1);
    button.append(circle, copy); button.addEventListener('click', () => selectEvent(state.events.indexOf(representative)));
    li.append(button); $('stages').append(li);
  });
}
function selectEvent(index, auto = false) {
  if (index < 0 || index >= state.events.length) return;
  state.selected = index; if (!auto) state.follow = false;
  renderEvents(); renderStages(); explainSelected();
  if (!auto) {
    const row = state.nodes.get(state.events[index].seq);
    const viewport = $('event-scroll');
    if (row && !row.hidden) {
      const bounds = row.getBoundingClientRect(), area = viewport.getBoundingClientRect();
      if (bounds.top < area.top) viewport.scrollTop -= area.top - bounds.top;
      else if (bounds.bottom > area.bottom) viewport.scrollTop += bounds.bottom - area.bottom;
    }
  }
}
function explainSelected() {
  const event = state.events[state.selected]; if (!event) return;
  $('raw-json').textContent = JSON.stringify(event.data, null, 2);
  $('raw-type').textContent = event.kind === 'data' ? event.data.type : event.kind;
  let association = sourceAssociation(event, state.meta?.teachingMap ?? [], state.lang);
  if (event.data.type === 'plugin_event') {
    association = { id: 'plugins', explanation: t('pluginExplain'), boundary: t('pluginBoundary') };
    loadSource('plugins', source => pluginAssociation(event.data.message, source.content));
    $('function-name').textContent = pluginAssociation(event.data.message).name;
  } else if (event.kind === 'diagnostic' && event.data.text?.startsWith('agent101-mock:')) {
    association = { id: 'mock', name: 'TutorialAdapter.stream', explanation: t('diagnosticExplain'), boundary: t('diagnosticBoundary') };
    loadSource('mock', source => { const start = source.content.split('\n').findIndex(l => l.includes('async *stream')) + 1; return { start, end: start + 12 }; });
  } else if (event.kind === 'diagnostic') {
    association = { id: 'runtime', name: 'observe / child stderr', explanation: t('processDiagnosticExplain'), boundary: t('processDiagnosticBoundary') };
    loadSource('runtime', source => { const start = source.content.split('\n').findIndex(l => l.includes('function observe(')) + 1; return { start, end: start + 18 }; });
  } else if (event.kind === 'complete' && state.run.mode === 'replay') {
    association = { id: 'run-store', name: 'RunStore.drive / replay', explanation: t('replayCompleteExplain'), boundary: t('replayCompleteBoundary') };
    loadSource('run-store', source => { const start = source.content.split('\n').findIndex(l => l.includes("if (run.mode === 'replay')")) + 1; return { start, end: start + 14 }; });
  } else if (event.kind === 'complete') {
    association = { id: 'runtime', name: 'executeExperiment / validation', explanation: t('completeExplain'), boundary: t('completeBoundary') };
    loadSource('runtime', source => { const start = source.content.split('\n').findIndex(l => l.includes('if (code !== 0)')) + 1; return { start, end: start + 18 }; });
  } else if (association) loadSource(association.id, () => association);
  if (association) {
    if (association.name) $('function-name').textContent = association.name;
    $('event-explanation').textContent = association.explanation;
    $('evidence-boundary').textContent = association.boundary;
  } else {
    $('event-explanation').textContent = t('selectEvent'); $('evidence-boundary').textContent = t('boundaryIntro');
  }
}
function renderResult() {
  const final = state.events.findLast(e => e.data?.type === 'final');
  const pass = state.events.findLast(e => e.data?.message?.startsWith('PASS:'));
  $('result-output').textContent = final?.data.text ?? pass?.data.message ?? t('resultEmpty');
  $('result-badge').textContent = state.run?.status === 'completed' ? t(state.run.mode === 'replay' ? 'recorded' : 'validated') : '';
  $('result-title').textContent = t('result');
}
function consume(event) {
  if (state.events.some(old => old.seq === event.seq)) return;
  state.events.push(event);
  if (event.kind === 'complete') {
    state.run.status = event.data.status; state.run.result = event.data.result;
    stream?.close(); clearTimeout(reconnectTimer);
    if (event.data.status === 'failed') handleError(new Error(event.data.result?.code)); else notice();
  }
  renderControls(); renderEvents(); renderStages(); renderResult();
  if (state.follow) selectEvent(state.events.length - 1, true);
}
function connect() {
  if (!state.run) return;
  stream?.close(); clearTimeout(reconnectTimer);
  const id = state.run.id;
  stream = new EventSource(`/api/runs/${id}/events?after=${state.events.at(-1)?.seq ?? 0}`);
  stream.addEventListener('update', message => {
    if (state.run?.id !== id) return;
    try { consume(JSON.parse(message.data)); } catch { notice('connectionError', 'retry', connect, true); }
  });
  stream.onopen = () => { clearTimeout(reconnectTimer); notice(); };
  stream.onerror = () => {
    if (state.run?.id !== id || state.run.status !== 'running') return;
    notice('connectionError', 'retry', connect, true);
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => { stream?.close(); notice('connectionError', 'retry', () => attachRun(id), true); }, 15000);
  };
}
function handleError(error) {
  if (error.message === 'RUN_ACTIVE' && error.runId) notice('activeRun', 'attach', () => attachRun(error.runId), true);
  else if (error.message === 'RUNTIME_MISSING') notice('install', undefined, undefined, true);
  else if (error.message === 'RUN_NOT_FOUND') notice('notFound', undefined, undefined, true);
  else if (error.message === 'TOKEN_REQUIRED') notice('appError', 'retryApp', bootstrap, true);
  else if (error.message === 'TIMEOUT') notice('timeoutError', undefined, undefined, true);
  else if (['PROCESS_FAILED', 'VALIDATION_FAILED', 'OUTPUT_LIMIT', 'FIXTURE_CHANGED'].includes(error.message)) notice('runError', undefined, undefined, true);
  else notice('genericError', undefined, undefined, true);
}
async function start() {
  if (state.busy || running()) return;
  state.busy = true; notice(); renderControls();
  try {
    const run = await api('/api/runs', { method: 'POST', body: { mode: state.mode, experiment: experiment() } });
    clearRun(); state.run = run; updateURL(); connect();
  } catch (error) { handleError(error); }
  finally { state.busy = false; renderControls(); renderEvents(); renderResult(); renderStages(); }
}
async function attachRun(id) {
  try {
    const run = await api(`/api/runs/${encodeURIComponent(id)}`);
    clearRun(); state.run = run; state.mode = run.mode;
    if ((run.experiment === 'plugins') !== (state.lesson === 'plugins')) state.lesson = run.experiment === 'plugins' ? 'plugins' : 'execution';
    renderLesson(); connect();
  } catch (error) { handleError(error); }
}
async function bootstrap() {
  try {
    state.meta = await api('/api/meta');
    $('source-file').replaceChildren(...state.meta.sourceFiles.map(file => {
      const option = el('option', '', file.path.split('/').at(-1)); option.value = file.id; return option;
    }));
    renderControls(); notice(state.meta.ready ? '' : 'install');
    await loadSource(experiment() === 'plugins' ? 'plugins' : 'agent', () => ({ start: experiment() === 'plugins' ? 9 : 174, end: experiment() === 'plugins' ? 26 : 189 }));
    const id = restoreRunId ?? new URLSearchParams(location.search).get('run');
    restoreRunId = null;
    if (id) await attachRun(id);
    else if (state.meta.activeRun) notice('activeRun', 'attach', () => attachRun(state.meta.activeRun));
  } catch { notice('appError', 'retryApp', bootstrap, true); renderControls(); }
}

$('start').addEventListener('click', start);
$('stop').addEventListener('click', async () => {
  if (!running()) return;
  $('stop').disabled = true; notice('stopping');
  try {
    await api(`/api/runs/${state.run.id}/stop`, { method: 'POST', body: {} });
    if (running()) connect();
  }
  catch { notice('stopError', undefined, undefined, true); renderControls(); }
});
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  if (running() || state.busy) return;
  state.mode = button.dataset.mode; renderControls(); notice(state.mode === 'live' && !state.meta?.ready ? 'install' : '');
}));
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => { state.filter = button.dataset.filter; renderEvents(); }));
$('follow').addEventListener('click', () => { state.follow = !state.follow; if (state.follow && state.events.length) selectEvent(state.events.length - 1, true); renderEvents(); });
$('previous').addEventListener('click', () => selectEvent(state.selected - 1));
$('next').addEventListener('click', () => selectEvent(state.selected + 1));
$('source-file').addEventListener('change', () => { state.follow = false; renderControls(); loadSource($('source-file').value); });
$('language').addEventListener('click', () => {
  state.lang = state.lang === 'zh' ? 'en' : 'zh';
  try { localStorage.setItem('agent101-language', state.lang); } catch { /* Locale still works without storage. */ }
  renderLesson(); notice(state.meta && !state.meta.ready ? 'install' : '');
});
$('export').addEventListener('click', () => {
  const contents = state.events.map(event => JSON.stringify({ ...event, mode: state.run.mode })).join('\n') + '\n';
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/x-ndjson' }));
  const link = el('a'); link.href = url; link.download = `agent101-${state.run.mode}-${state.run.id}.jsonl`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('pagehide', () => { stream?.close(); sourceController?.abort(); clearTimeout(reconnectTimer); });
window.addEventListener('popstate', () => {
  const params = new URLSearchParams(location.search);
  const id = params.get('run');
  state.lang = params.get('lang') === 'en' ? 'en' : 'zh';
  const name = params.get('lesson');
  if (['start', 'execution', 'plugins'].includes(name)) state.lesson = name;
  if (id && id !== state.run?.id) attachRun(id);
  else { if (!id && !running()) clearRun(); renderLesson(); }
});
// Keep static controls inert until their module-owned handlers are connected.
['language', 'follow'].forEach(id => { $(id).disabled = false; });
document.querySelectorAll('[data-filter]').forEach(button => { button.disabled = false; });
renderLesson(); bootstrap();
