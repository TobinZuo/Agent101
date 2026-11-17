// Teaching model only: this is not DSH or a Cordis implementation.
// No network calls, credentials, dependencies, or file writes.
import assert from 'node:assert/strict';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function runScenario(cancelOnUnload) {
  console.log(`\nScenario: ${cancelOnUnload ? 'remove + cancel' : 'remove only'}`);
  const controller = new AbortController();
  const response = deferred();
  const registry = new Map();
  registry.set('llm', {
    async generate(signal) {
      console.log('1. request started; waiting for mock response');
      const aborted = deferred();
      const onAbort = () => aborted.resolve('cancelled');
      signal.addEventListener('abort', onAbort, { once: true });
      try {
        if (signal.aborted) return 'cancelled';
        return await Promise.race([response.promise, aborted.promise]);
      } finally {
        signal.removeEventListener('abort', onAbort);
      }
    },
  });

  // The caller retains a reference even after the registry entry is removed.
  const service = registry.get('llm');
  const pending = service.generate(controller.signal);
  registry.delete('llm');
  console.log(`2. registry entry removed; has llm = ${registry.has('llm')}`);
  if (cancelOnUnload) {
    console.log('3. cleanup explicitly aborts and awaits the request');
    controller.abort();
  } else {
    console.log('3. no cancellation; mock response is delivered');
    response.resolve('completed');
  }

  const result = await pending;
  assert.equal(registry.has('llm'), false);
  assert.equal(result, cancelOnUnload ? 'cancelled' : 'completed');
  console.log(`4. request ${result}; cleanup can finish`);
}

await runScenario(false);
await runScenario(true);
