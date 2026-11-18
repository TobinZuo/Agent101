# Chapter 02: Follow an Input Through the Agent Execution Chain

[简体中文](02-agent-execution-chain.md) | [English](02-agent-execution-chain.en.md) · [Previous: first task](01-first-task.en.md) · [Next: plugins and ctx](03-plugins-and-context.en.md) · [Home](../../README_EN.md)

> Try this chapter in the [Agent101 Web workbench](../../web/README_EN.md): run experiments, select actual events and inspect linked source. The workbench uses the fixed local adapter; no API key is required.

The previous chapter exposed a tool call, file contents, and a final response. Now ask: **which code actually connects the model to the tools?**

We follow the headless first-task path at official commit [`38a6a5c`][baseline]. Web and SDK surfaces can use the same core capabilities, but their entry and output adapters differ. They are outside this trace.

## 1. Read the code with two requests in mind

In the run directory printed by the [chapter 01 experiment](01-first-task.en.md), open `stderr.log` and find:

```text
agent101-mock: request=1; lastRole=user
agent101-mock: request=2; lastRole=tool
```

Our mock adapter prints these markers on actual entry to `stream()`. The first request returns a tool call; the second already sees the tool result. These are lab markers, not built-in DSH event names or statistics about real model behavior.

Open [`packages/core/agent-loop/src/agent.ts`][agent]. Every function name in this reading map exists at the pinned revision:

```text
headless runner
  agent.followup(message)
    → send(message, 'next-turn', true)
    → wakeDriver()
    → kick()
      → turn()
        → preStep()
        → step()
          → prepareRequest()
          → buildRequest()
          → preparedCall.stream(request) / ctx.llm.stream(request)
          → ctx.tools.execute(...)  (when tool calls exist)
        → next step, or close the turn
```

The map emphasizes calls and omits intermediate logging, stream processing, and error branches. It is not runnable pseudocode.

## 2. Entry: followup puts input in the inbox

The [headless runner][runner] waits for readiness, creates or resumes an Agent, submits a user message with `agent.followup(...)`, waits for work to settle, and produces its output.

In `ReactLoopAgent`:

```ts
followup(input: UserMessage): void {
  this.send(input, 'next-turn', true)
}
```

The important arguments are the `next-turn` target and the wakeup flag. `send()` inserts the message through the inbox's structural operation before calling `wakeDriver()`. [Input source][agent]

Calling `followup()` therefore does not synchronously return a model answer. Input enters a lifecycle-managed queue; requests, tools, and final output follow asynchronously.

The same class has `steer()` and `inject()`. The former targets the next step and wakes the driver; the latter targets the next step without waking it. These message APIs are distinct from Cordis dependency declarations named `inject`.

## 3. The driver: one message does not create another independent loop

`wakeDriver()` checks the current phase. When idle, it creates a running phase with an `AbortController`, retains an activity-completion Promise, and enters `kick()`. An already-running Agent does not start a separate driver for each new message. Maintenance and cancelled activities have their own deferred-wakeup behavior. [`wakeDriver()`][agent]

The central pattern in `kick()` is:

```ts
while (await this.turn()) {}
```

The `await` allows other execution while this asynchronous operation waits. It does not pause the whole Node process or require a separate process polling the queue.

## 4. Turns and steps: one task may request the model several times

`turn()` records `turn/start`, then prepares and advances steps. The documented definition is one model request and its tool calls per step; a turn contains zero or more steps. [Turn flow][architecture]

For the normal path in our experiment:

| Stage | Adapter output | Loop action |
| --- | --- | --- |
| Step 1 | Fixed file-reading tool call | Execute the real Shell tool |
| Step 2 | Text containing the tool result, without tool calls | Complete the turn normally |

One user message, one turn, and one model request are different units. Pre-step rejection can produce no step. Tools, pending input, and stopping hooks also affect completion. Retries inside a step add another distinction: logical steps versus actual model attempts. [Loop guide][loop-doc]

## 5. preStep: decide what the request is allowed to see

Find `preStep()` from `turn()` and follow these operations:

1. Claim input from the inbox.
2. Read and snapshot model selection.
3. Resolve the tool set and assemble the prompt and tool declarations.
4. Run `agent/pre-step` to accept, rewrite, or reject input.

Model input is more than appending the user's latest sentence. Plugins, visible tools, model selection, and runtime context all participate in preparation. [`preStep()`][agent]

The admitted tool set also has a lifecycle and is released after the step. A tool registry is not permanently static, and a newly registered tool with the same name cannot necessarily take over an older step's call. [Tool admission checks][tools]

## 6. step: prepare the call, record input, consume the response

`step()` calls `prepareRequest()`, which passes through `agent/request` and calls `ctx.llm.prepareCall()` to bind a specific adapter and its capabilities. The loop then admits system and user input according to those rules, records request information, constructs the request, and consumes the stream. [`step()` and `prepareRequest()`][agent]

`buildRequest()` uses `session.deriveMessages()` to derive model messages from recorded facts and construct a frozen request. **This is the connection that lets the next request use a tool's file contents.**

After the stream settles, the loop assembles an assistant message and selects its `tool-call` blocks. When present, dispatch uses:

```ts
await this.loopCtx.tools.execute({
  calls: toolCalls,
  signal,
  agent: this,
  log: { turn, step },
  maxParallelToolCalls,
  toolSet: decision.toolSet,
})
```

This is the actual argument shape from the source. The loop delegates the raw batch and context; the tool system and selected executor handle execution, policy, concurrency, and results. The loop does not simply `eval()` a string returned by the model. [Call site][agent], [tool pipeline][tools]

## 7. What connects successive requests?

The Session is the connection. Tool calls and results become session events, and the next request derives its history from the Session. Lifecycle events such as turns and steps are also recorded, making the raw log richer than model input. [Session log][architecture]

Keep three views distinct:

| View | Purpose |
| --- | --- |
| Session event log | Historical facts for derivation, recovery, and persistence |
| Model request messages | Model input derived from history and current rules |
| Headless `--json` | Caller-facing projection of status, tools, and final results |

Chapter 01's `events.jsonl` belongs to the third category. It helps observe a task but does not replace raw Session data or a token-by-token transport trace. Headless `text` is projected from committed assistant messages, rather than emitted for each incoming token. [Headless output guide][headless]

## 8. Turn understanding into verification

Work through this source-reading exercise:

1. Find `agent.followup()` in the [runner][runner].
2. Draw `send → wakeDriver → kick → turn` from [agent.ts][agent].
3. Mark `prepareCall()`, `deriveMessages()`, and `tools.execute()`.
4. Compare the two request markers and tool events, explaining how the second request receives real file content.

Check your answers:

- Who executes the model's tool calls? The tool system and executor.
- Where does the next request's history come from? Messages derived from the Session, rather than a model process locally retaining file reads.
- Do two request markers establish real model reasoning? No. They show local adapter invocations; tool execution and content checks supply separate evidence.

The call relationships come from pinned source inspection. The companion execution uses locked published packages; see the [verification record](../../labs/dsh/evidence/verification.json). We did not instrument every internal function or measure performance. Next, we examine why these capabilities are available through `ctx`, and how they are installed and cleaned up.

[baseline]: https://github.com/deepseek-ai/deepseek-harness/tree/38a6a5c965aa99ab525161efb7cc5cf1fe62fced
[agent]: https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/packages/core/agent-loop/src/agent.ts
[runner]: https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/packages/bundle/headless/src/index.ts
[loop-doc]: https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/packages/core/agent-loop/README.md
[architecture]: https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/docs/architecture.md
[tools]: https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/packages/core/tools/src/index.ts
[headless]: https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/packages/bundle/headless/README.md
