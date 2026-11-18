# 第 02 篇：一句输入，怎样走完 Agent 执行链

[简体中文](02-agent-execution-chain.md) | [English](02-agent-execution-chain.en.md) · [上一篇：首次任务](01-first-task.md) · [下一篇：插件与 ctx](03-plugins-and-context.md) · [首页](../../README.md)

> 也可以在 [Agent101 Web 工作台](../../web/README.md) 中学习本篇：启动实验、选择真实日志、联动查看源码。工作台使用固定本地模型适配器，无需 API Key。

上一篇已经看到工具调用、读取结果和最终回复。这一篇回答一个问题：**这些事件背后，具体是哪段代码把模型和工具连起来的？**

我们只追踪 headless 首次任务这条路径，固定源码提交为 [`38a6a5c`][baseline]。Web 与 SDK 也能使用同一套核心能力，但入口和输出适配不同，不把它们混进这条调用链。

## 1. 先带着两次请求读代码

在 [第 01 篇实验](01-first-task.md) 打印的运行目录中，打开 `stderr.log`，找到：

```text
agent101-mock: request=1; lastRole=user
agent101-mock: request=2; lastRole=tool
```

这些行来自我们的模拟适配器，标记实际进入 `stream()` 的次数。第一请求得到工具调用，第二请求已经能看到工具结果。它们不是 DSH 内置的事件名，也不代表真实模型的行为统计。

然后打开 [`packages/core/agent-loop/src/agent.ts`][agent]。下面是一张阅读路线，函数名都来自这个版本的真实实现：

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
          → ctx.tools.execute(...)  （存在工具调用时）
        → 下一 step，或关闭 turn
```

这张图强调谁调用谁，省略了中间的日志写入、流处理和异常分支；不是可直接运行的伪实现。

## 2. 入口：followup 把输入送进队列

先看 [headless runner][runner]。它等待应用就绪，创建或恢复 Agent，调用 `agent.followup(...)` 提交用户消息，再等待工作收敛并输出结果。

在 `ReactLoopAgent` 中，可以读到：

```ts
followup(input: UserMessage): void {
  this.send(input, 'next-turn', true)
}
```

这个短函数有两个关键参数：消息目标是 `next-turn`，并且需要唤醒驱动器。`send()` 先通过 inbox 的结构操作加入消息，再调用 `wakeDriver()`。[消息入口源码][agent]

因此，调用 `followup()` 并不是直接同步获得一次模型回复。输入先进入受生命周期管理的队列。模型请求、工具执行和最终输出都发生在后续异步推进中。

这里还存在 `steer()` 和 `inject()`：前者目标为下一 step 并唤醒；后者加入下一 step 输入但不主动唤醒。它们与 Cordis 的依赖声明 `inject` 不是同一个概念，本篇先记住区别即可。

## 3. 驱动器：避免为同一 Agent 随意启动多个循环

`wakeDriver()` 会检查当前状态。空闲时，它建立运行阶段和 `AbortController`，保存活动完成的 Promise，再进入 `kick()`。已经在运行时，不会因为每条新消息再开一个独立驱动器；维护或已取消等状态有相应的后续唤醒处理。[`wakeDriver()`][agent]

`kick()` 中最容易识别的主线是：

```ts
while (await this.turn()) {}
```

这里的 `await` 让出异步等待期间的执行机会。它不表示“整个 Node 进程停止工作”，也没有要求单独的进程轮询队列。

## 4. turn 与 step：一次任务可以请求模型多次

`turn()` 先写入 `turn/start`，然后准备和推进 step。官方定义中，step 对应一次模型请求及其工具调用，turn 可以有零个或多个 step。[架构 Turn flow][architecture]

套回本实验，正常路径是：

| 推进阶段 | 模型适配器返回 | 循环接下来做什么 |
| --- | --- | --- |
| 第 1 个 step | 固定的文件读取工具调用 | 执行真实 Shell 工具 |
| 第 2 个 step | 包含工具结果的文字，无工具调用 | 正常完成当前轮次 |

不要把“一条用户消息”“一个 turn”“一次模型请求”当作同一单位。输入可能在预处理时被拒绝，从而没有 step；工具、下一步输入和停止扩展点也会影响结束条件。重试发生在 step 内部时，还要区分逻辑 step 与实际模型尝试次数。[循环包说明][loop-doc]

## 5. preStep：先决定这一请求允许看见什么

沿着 `turn()` 找到 `preStep()`，依次观察：

1. 从 inbox 收取本次输入。
2. 读取并快照当前模型选择。
3. 解析可用工具集合，组装系统提示与工具声明。
4. 经过 `agent/pre-step` 扩展点，接受、改写或拒绝输入。

这一步说明，模型收到的内容并非“直接拼上用户最后一句话”。插件、工具可见范围、模型选择和运行上下文都会参与准备。[`preStep()` 源码][agent]

工具集合还有生命周期：本 step 完成后会释放此次 admission。不要假设工具注册表是永久不变的，或同名新工具一定可以接手旧 step 的调用。[工具服务的 admission 检查][tools]

## 6. step：准备模型调用，记录输入，再消费响应

`step()` 调用 `prepareRequest()`。后者经过 `agent/request` 扩展点，并调用 `ctx.llm.prepareCall()` 绑定具体模型适配器与相应能力。之后才按规则接纳系统提示和用户输入，记录请求信息，构造请求并消费流。[`step()` 与 `prepareRequest()`][agent]

`buildRequest()` 使用 `session.deriveMessages()`，从已记录事实派生模型消息，并构造冻结的请求对象。**这就是下一次请求能“记住”工具读取结果的连接点。**

模型流结束后，循环形成助手消息，从其内容中选出 `tool-call` 块。如果有工具调用，执行入口是：

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

这是源码中的实际参数形状。Loop 交出原始批次与上下文，工具系统与选定的执行器负责后续执行、策略、并发和结果处理。它不等于在循环里直接对模型返回的字符串调用 `eval()`。[调用点][agent]、[工具管线][tools]

## 7. 两个循环之间，信息靠什么连接

核心连接点是 Session。工具调用和结果进入会话事件，下一次请求从 Session 派生历史。它同时还记录 turn、step 等生命周期事实，所以原始日志比模型输入更丰富。[Session log][architecture]

不要混淆下面三份东西：

| 观察面 | 用途 |
| --- | --- |
| Session 事件日志 | 记录历史事实，支持派生、恢复与持久化 |
| 模型请求消息 | 从会话历史和当前规则派生出来的模型输入 |
| headless `--json` | 面向调用方的输出投影，包含状态、工具和最终结果等事件 |

第 01 篇保存的 `events.jsonl` 属于第三种。它适合观察任务，却不能替代 Session 原始数据或逐 token 模型传输记录。headless 的 `text` 来自提交的助手消息，而非逐 token 到达就输出。[headless 输出说明][headless]

## 8. 从读懂变成能验证

按以下顺序做一遍定位练习：

1. 在 [runner][runner] 找到 `agent.followup()`。
2. 在 [agent.ts][agent] 画出 `send → wakeDriver → kick → turn`。
3. 标出 `prepareCall()`、`deriveMessages()` 和 `tools.execute()`。
4. 对照运行目录里的两个 request 标记与工具事件，解释第二次请求为何可以使用真实文件内容。

检查自己能否回答：

- 模型输出工具调用后，真正执行的是谁？工具系统与执行器。
- 下一步历史从哪里来？Session 派生消息，而不是模型进程在本地保存文件读取结果。
- 两次 request 标记能证明真实模型推理了吗？不能，它只证明本地适配器被调用；工具闭环与内容校验另有证据。

这篇的调用关系来自固定源码；配套实际执行的是锁定版本的发布包，结果见[验证记录](../../labs/dsh/evidence/verification.json)。没有给每个内部函数加 tracing，也没有测量性能。下一篇继续解释：这些能力为什么都能从 `ctx` 访问，以及它们怎样被安装和清理。

[baseline]: https://github.com/deepseek-ai/deepseek-harness/tree/38a6a5c965aa99ab525161efb7cc5cf1fe62fced
[agent]: https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/packages/core/agent-loop/src/agent.ts
[runner]: https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/packages/bundle/headless/src/index.ts
[loop-doc]: https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/packages/core/agent-loop/README.md
[architecture]: https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/docs/architecture.md
[tools]: https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/packages/core/tools/src/index.ts
[headless]: https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/packages/bundle/headless/README.md
