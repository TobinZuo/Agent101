import assert from 'node:assert/strict'

export async function runCordisExercise({ Context, Service, FiberState }, emit = console.log) {
  const root = new Context()
  const trace = []
  const record = (message) => {
    trace.push(message)
    emit(message)
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
  emit('PASS: dependency activation, teardown, replacement, and root cleanup')
}
