export function eventKey(event) {
  if (event.kind === 'diagnostic') return 'diagnostic';
  if (event.kind === 'complete') return 'complete';
  const d = event.data;
  if (d.type === 'status') return d.phase === 'step_start' ? `step_start_${d.step}` : d.phase;
  return d.type;
}

export function sourceAssociation(event, map, locale) {
  const key = eventKey(event);
  const entry = map.find(item => item.id === key);
  if (!entry) return null;
  const source = entry.sources.find(s => s.file.endsWith('/agent.ts')) ?? entry.sources[0];
  const id = source.file.endsWith('/agent.ts') ? 'agent' : source.file.endsWith('/json-stream.ts') ? 'json-stream' : 'headless';
  return { id, start: source.startLine, end: source.endLine, name: source.functionName,
    explanation: entry.explanation[locale], boundary: entry.doesNotProve[locale] };
}

export function pluginAssociation(message, content = '') {
  let needle = 'const consumer =';
  let name = 'ctx.plugin / inject';
  if (message.includes('after provider:') || message.startsWith('consumer:')) { needle = 'const provider ='; name = 'Service / consumer.await'; }
  if (message.includes('released') || message.includes('disposal') || message.includes('service removed')) { needle = 'await provider.dispose()'; name = 'Fiber.dispose / effect cleanup'; }
  if (message.includes('replacement')) { needle = '  await root.plugin(TutorialGreeter)'; name = 'dependency reactivation'; }
  if (message.startsWith('PASS:')) { needle = 'assert.equal(releases, 2)'; name = 'lifecycle assertions'; }
  const lines = content.split('\n');
  const index = lines.findIndex(line => line.includes(needle));
  return { id: 'plugins', start: Math.max(1, index + 1), end: Math.min(lines.length || 20, Math.max(1, index + 1) + 10), name };
}

export function stageIndex(event, plugins) {
  if (event.kind === 'complete') return event.data.status === 'completed' ? 3 : -1;
  if (plugins) {
    const text = event.data?.message ?? '';
    if (text.includes('replacement') || text.startsWith('PASS:')) return 3;
    if (text.includes('released') || text.includes('disposal') || text.includes('removed')) return 2;
    if (text.includes('acquired') || text.startsWith('consumer:') || text.includes('after provider:')) return 1;
    return 0;
  }
  const key = eventKey(event);
  if (['text', 'final', 'turn_end', 'complete'].includes(key)) return 3;
  if (['tool_call', 'tool_result'].includes(key)) return 2;
  if (key.startsWith('step_start') || key === 'step_end' || key === 'diagnostic') return 1;
  return 0;
}
