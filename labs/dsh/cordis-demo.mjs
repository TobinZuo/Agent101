import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { build } from 'esbuild'

// An isolated Cordis mechanism experiment; no DSH application or model is launched.
const checkout = process.argv[2]
assert.ok(checkout, 'Usage: node cordis-demo.mjs /path/to/pinned/deepseek-harness')
const sourceRoot = resolve(checkout)
const revision = execFileSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
assert.equal(revision, '38a6a5c965aa99ab525161efb7cc5cf1fe62fced', 'Use the pinned DSH checkout')
execFileSync('git', ['-C', sourceRoot, 'diff', '--quiet', 'HEAD', '--', 'vendor/cordis', 'vendor/cosmokit'])
const bundle = await build({
  entryPoints: [resolve(sourceRoot, 'vendor/cordis/src/index.ts')],
  alias: {
    '@deepseek-ai/cosmokit': resolve(sourceRoot, 'vendor/cosmokit/src/index.ts'),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
})
const { Context, Service, FiberState } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
)
const root = new Context()
const trace = []
const record = (message) => {
  trace.push(message)
  console.log(message)
}
let activations = 0
let releases = 0

try {
  // Awaiting mounting only drains current lifecycle work. Missing inject keeps PENDING.
  const consumer = await root.plugin({
    name: 'tutorial-consumer',
    inject: ['tutorialGreeter'],
    apply(ctx) {
      activations += 1
      record(`consumer: ${ctx.tutorialGreeter.greet('Agent101')}`)
      ctx.effect(() => {
        record('effect: acquired')
        return async () => {
          await Promise.resolve()
          releases += 1
          record('effect: released')
        }
      })
    },
  })
  assert.equal(consumer.state, FiberState.PENDING)
  assert.equal(activations, 0)
  record(`consumer before provider: ${FiberState[consumer.state]}`)

  class TutorialGreeter extends Service {
    constructor(ctx) {
      super(ctx, 'tutorialGreeter')
    }

    greet(who) {
      return `Hello, ${who}!`
    }
  }

  const provider = await root.plugin(TutorialGreeter)
  await consumer.await()
  assert.equal(consumer.state, FiberState.ACTIVE)
  assert.equal(activations, 1)
  record(`consumer after provider: ${FiberState[consumer.state]}`)

  await provider.dispose()
  assert.equal(consumer.state, FiberState.PENDING)
  assert.equal(releases, 1)
  assert.equal(root.get('tutorialGreeter'), undefined)
  record(`consumer after provider disposal: ${FiberState[consumer.state]}`)
  record('service removed: true')

  await root.plugin(TutorialGreeter)
  await consumer.await()
  assert.equal(consumer.state, FiberState.ACTIVE)
  assert.equal(activations, 2)
  record(`consumer after replacement: ${FiberState[consumer.state]}`)
} finally {
  await root.fiber.dispose()
}
assert.equal(releases, 2)
assert.deepEqual(trace, [
  'consumer before provider: PENDING',
  'consumer: Hello, Agent101!',
  'effect: acquired',
  'consumer after provider: ACTIVE',
  'effect: released',
  'consumer after provider disposal: PENDING',
  'service removed: true',
  'consumer: Hello, Agent101!',
  'effect: acquired',
  'consumer after replacement: ACTIVE',
  'effect: released',
])
console.log('PASS: dependency activation, teardown, replacement, and root cleanup')
