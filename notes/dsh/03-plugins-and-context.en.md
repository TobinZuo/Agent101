# 03 · How plugins and ctx work

[中文](03-plugins-and-context.md) | English

> Try this chapter in the [Agent101 Web workbench](../../web/README_EN.md): run experiments, select actual events and inspect linked source. The workbench uses the fixed local adapter; no API key is required.

[Repository home](../../README_EN.md) · [Overview](00-harness-and-agent-loop.en.md) · [Previous: Agent execution chain](02-agent-execution-chain.en.md)

> Source baseline: DeepSeek Harness `38a6a5c965aa99ab525161efb7cc5cf1fe62fced`. This experiment uses its actual vendored Cordis implementation. It makes no model calls and does not launch a complete DSH application.

## The questions behind this chapter

DSH source code frequently uses `apply(ctx)`, `inject`, and `ctx.tools`. How do these fit together? What happens to consumers when their service provider is unloaded?

We will mount a consumer before its required service exists, then add the service, unload it, and add a replacement instance.

By the end, you should be able to explain four things:

- How a plugin receives its own `ctx`.
- How a service exposes a named capability to other plugins.
- How `inject` controls activation and the removal of contributions.
- How `ctx.effect()` attaches cleanup to a plugin's lifecycle.

## Run it and observe

Prepare Node.js **>=24.9.0** and a DSH checkout at the fixed commit above. No `DEEPSEEK_API_KEY` is needed.

From the Agent101 repository root, run:

```sh
cd labs/dsh
npm ci
node cordis-demo.mjs /absolute/path/to/deepseek-harness
```

The last argument must point to the DSH repository itself: the directory containing `vendor/cordis/src/index.ts`. Replace the placeholder `/absolute/path/to/deepseek-harness` with a real local path.

Using pinned `esbuild@0.27.0`, the script compiles that checkout's Cordis and Cosmokit source in memory and loads the actual `Context`, `Service`, and `FiberState`. It does not simulate a dependency container or require a full DSH build.

Expected output, also observed when running this experiment:

```text
consumer before provider: PENDING
consumer: Hello, Agent101!
effect: acquired
consumer after provider: ACTIVE
effect: released
consumer after provider disposal: PENDING
service removed: true
consumer: Hello, Agent101!
effect: acquired
consumer after replacement: ACTIVE
effect: released
PASS: dependency activation, teardown, replacement, and root cleanup
```

This output demonstrates framework behavior. It does not verify model requests, tool execution, or cancellation of real in-flight tasks.

## First observation: mounting does not guarantee activation

The experiment mounts the consumer first:

```js
const consumer = await root.plugin({
  name: 'tutorial-consumer',
  inject: ['tutorialGreeter'],
  apply(ctx) {
    // This runs only when the required service is available.
  },
})
```

`inject: ['tutorialGreeter']` declares a required dependency. With no corresponding service available, the consumer stays `PENDING` and its `apply` does not run.

**There is already an `await` here, yet the plugin remains PENDING.** `ctx.plugin()` returns an awaitable Fiber handle. Awaiting it drains current loading or unloading work and propagates startup errors. It neither creates missing services nor waits indefinitely for a future provider.

Do not treat `await ctx.plugin(...)` as an `ACTIVE` guarantee. The experiment asserts `FiberState.PENDING` at this point and verifies that the consumer has run zero times.

Source: [Mounting and the thenable wrapper](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/vendor/cordis/src/registry.ts#L316-L335), [Fiber.await](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/vendor/cordis/src/fiber.ts#L748-L759).

## Second observation: a provider activates the consumer

Our provider is a real `Service` subclass:

```js
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
```

`super(ctx, 'tutorialGreeter')` registers a service named `tutorialGreeter`. Once the provider becomes available, Cordis checks the consumer's dependency and runs its `apply(ctx)`.

The consumer calls `ctx.tutorialGreeter.greet('Agent101')`. It depends on a service name and interface, without needing to know which configuration entry installs the provider.

Calling `consumer.await()` again waits for the current lifecycle work triggered by provider activation. The experiment then asserts `consumer.state === FiberState.ACTIVE`.

Source: [Service registration](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/vendor/cordis/src/service.ts#L32-L58), [Dependency checks and transitions](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/vendor/cordis/src/fiber.ts#L617-L645).

## What ctx actually is

`ctx` is a Cordis context object. Plugins use it to access services, mount children, register listeners, and create lifecycle effects.

The root `Context` installs reflection, plugin registry, event, and logging services. When mounting a plugin, its Fiber creates a context through `parent.extend({ fiber: this })` and passes it to the plugin entry point.

Plugins therefore have their own lifecycle ownership and access to visible services through their context; they do not simply share an ordinary dictionary.

| Concept in this chapter | Purpose |
| --- | --- |
| Plugin | A function, object, or class that installs behavior and contributions |
| Fiber | Runtime handle and state for one plugin mounting |
| `ctx` | The instance's entry point for services and contributions |
| Service | A named capability provided by a plugin, such as `tutorialGreeter` |
| `inject` | The consumer's declaration of required services |

This `ctx` is neither Session history nor the message list sent to a model. When reading about context, first identify whether the code means a Cordis context or model request contents.

Source: [Context proxy and built-in services](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/vendor/cordis/src/context.ts#L35-L83), [Plugin instance context](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/vendor/cordis/src/fiber.ts#L238-L265).

## Third observation: unloading removes contributions

When the consumer activates, it registers an effect:

```js
ctx.effect(() => {
  record('effect: acquired')
  return async () => {
    await Promise.resolve()
    releases += 1
    record('effect: released')
  }
})
```

The effect body runs immediately. Its returned function is a disposer that Cordis invokes when the owning plugin unloads. A disposer can be asynchronous.

This experiment uses logs and counters to observe lifecycle behavior; it opens no files or connections. A real plugin can acquire resources such as watchers or connections inside an effect and release them in its disposer.

Next, the script runs:

```js
await provider.dispose()
```

The provider becomes unavailable, so the consumer unloads its effect and prints `effect: released`. Provider disposal waits for relevant cleanup. The service lookup is now empty, and the consumer returns to `PENDING`.

**The consumer has not been permanently disposed.** Its mounting remains, but a required dependency is missing. Mounting `TutorialGreeter` again runs the consumer's `apply` a second time, producing another greeting and resource acquisition.

Finally, `root.fiber.dispose()` removes the plugins owned by the root and releases the second effect. The script asserts the expected activation and acquisition behavior, with exactly two releases.

Source: [Effect registration and cleanup](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/vendor/cordis/src/fiber.ts#L408-L424), [Dependent and provider teardown order](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/vendor/cordis/src/fiber.ts#L712-L745).

## Connect this back to DSH

DSH capabilities such as `ctx.tools` use the same machinery. For example, the real `ToolsService.register()` returns a disposer that unregisters a tool and manages this contribution through a lifecycle effect.

Removing a registration does not by itself establish that an already running task is automatically cancelled. In-flight behavior requires inspecting the specific executor, cancellation signals, and resource cleanup implementation.

Also, an ordinary plugin may fail when directly accessing a service without declaring the dependency. For an optional capability, probe with `ctx.get('serviceName')` and handle its absence. Adding `?.` alone does not bypass dependency access rules.

Source: [Tool registration effect](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/packages/core/tools/src/index.ts#L121-L152), [Service property access rules](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/vendor/cordis/src/reflect.ts#L143-L179), [Optional service lookup](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/vendor/cordis/src/reflect.ts#L9-L19).

## Try it yourself

1. Remove the initial provider mounting and subsequent provider steps, keeping only the consumer and root cleanup. Confirm that the consumer never executes, even though mounting uses `await`.
2. Call the injected greeting service inside the consumer's disposer. Observe why provider cleanup must wait for dependent teardown.
3. Add a short delay to the asynchronous effect disposer. Observe whether `await provider.dispose()` waits for the release log before continuing.
4. Explain in your own words: why can a replacement service reactivate the consumer, while restoring that service after an explicit `consumer.dispose()` does not restart it?

Further reading: [Official DSH Cordis services tutorial](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/docs/cordis-tutorial/03-services.md), [Lifecycle and effects](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/docs/cordis-tutorial/02-lifecycle-and-effects.md).

[Previous: Agent execution chain](02-agent-execution-chain.en.md) · [Overview](00-harness-and-agent-loop.en.md)
