# 03 · 插件和 ctx 怎样工作

中文 | [English](03-plugins-and-context.en.md)

> 也可以在 [Agent101 Web 工作台](../../web/README.md) 中学习本篇：启动实验、选择真实日志、联动查看源码。工作台使用固定本地模型适配器，无需 API Key。

[仓库首页](../../README.md) · [全景导读](00-harness-and-agent-loop.md) · [上一篇：Agent 执行链](02-agent-execution-chain.md)

> 源码基线：DeepSeek Harness `38a6a5c965aa99ab525161efb7cc5cf1fe62fced`。本篇实验使用其中 vendored Cordis 的真实实现，不调用模型，也不启动完整 DSH 应用。

## 这一篇要解决什么问题

阅读 DSH 源码时，经常遇到 `apply(ctx)`、`inject`、`ctx.tools`。它们之间是什么关系？如果服务提供方被卸载，消费方还能继续工作吗？

我们先运行一个小实验：让消费方先挂载，但暂时不给它所需的服务；随后添加服务、卸载服务，再添加一个新实例。

完成后，你应该能解释四件事：

- 插件如何获得自己的 `ctx`。
- 服务如何通过名称供其他插件使用。
- `inject` 如何决定插件何时运行、何时撤销贡献。
- `ctx.effect()` 如何把资源清理交给插件生命周期。

## 先运行，再观察

准备 Node.js **>=24.9.0**，并准备好上述固定提交的 DSH 源码 checkout。这里不需要 `DEEPSEEK_API_KEY`。

从 Agent101 仓库根目录运行：

```sh
cd labs/dsh
npm ci
node cordis-demo.mjs /absolute/path/to/deepseek-harness
```

最后一个参数必须指向 DSH 仓库本身，例如包含 `vendor/cordis/src/index.ts` 的目录。`/absolute/path/to/deepseek-harness` 是占位路径，请替换为本机真实路径。

脚本通过固定版本 `esbuild@0.27.0` 在内存中编译该 checkout 的 Cordis 与 Cosmokit 源码，再加载真实 `Context`、`Service` 和 `FiberState`。它没有自行模拟依赖容器，也不需要构建整个 DSH。

预期输出，也是这份实验已观察到的输出：

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

这份输出说明的是框架机制。它没有验证模型请求、工具执行或真实在途任务的取消。

## 第一个观察：挂载成功，不代表插件已运行

实验首先挂载消费方：

```js
const consumer = await root.plugin({
  name: 'tutorial-consumer',
  inject: ['tutorialGreeter'],
  apply(ctx) {
    // 服务就绪后，这个函数才会执行。
  },
})
```

`inject: ['tutorialGreeter']` 声明硬性依赖。此时没有对应服务，消费方保持 `PENDING`，`apply` 没有执行。

**这里已经写了 `await`，但插件依然是 PENDING。** `ctx.plugin()` 返回可等待的 Fiber 句柄；等待它只会排空当前加载或卸载工作，并传播启动错误。等待过程中不会凭空创建缺失服务，也不会持续等待未来提供方出现。

因此，不能把 `await ctx.plugin(...)` 当作 `ACTIVE` 保证。实验直接断言此时状态是 `FiberState.PENDING`，并断言消费方执行次数为 0。

对应源码：[插件挂载与 thenable 包装](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/vendor/cordis/src/registry.ts#L316-L335)、[Fiber.await](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/vendor/cordis/src/fiber.ts#L748-L759)。

## 第二个观察：提供服务后，消费方才激活

实验中的提供方是一个真实 `Service` 子类：

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

`super(ctx, 'tutorialGreeter')` 注册名称为 `tutorialGreeter` 的服务。提供方进入可用状态后，Cordis 检查消费方依赖，再运行它的 `apply(ctx)`。

消费方通过 `ctx.tutorialGreeter.greet('Agent101')` 调用服务。它依赖的是服务名称与接口，不需要知道哪个配置项负责安装提供方。

这里第二次调用 `consumer.await()`，用于等待提供方激活触发的当前生命周期工作；随后断言 `consumer.state === FiberState.ACTIVE`。

对应源码：[Service 注册](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/vendor/cordis/src/service.ts#L32-L58)、[依赖检查与状态切换](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/vendor/cordis/src/fiber.ts#L617-L645)。

## ctx 到底是什么

`ctx` 是 Cordis 的上下文对象：插件通过它访问服务、挂载子插件、注册监听器和生命周期 effect。

根 `Context` 创建时装入反射、插件注册、事件与日志等基础服务。挂载插件时，Fiber 会通过 `parent.extend({ fiber: this })` 为该插件创建上下文，再将它传入插件入口。

所以，多个插件并非拿着一个普通共享字典。它们具有各自的生命周期归属，并通过上下文访问可见的服务。

| 本篇概念 | 作用 |
| --- | --- |
| 插件 | 安装行为与贡献的函数、对象或类 |
| Fiber | 某一次插件挂载的运行时句柄与状态 |
| `ctx` | 该实例访问服务、注册贡献的入口 |
| 服务 | 插件提供的具名能力，例如 `tutorialGreeter` |
| `inject` | 消费方声明必需的服务 |

这里的 `ctx` 不是 Session 历史，也不是发送给模型的消息列表。阅读上下文相关代码时，先确认讨论的是 Cordis 上下文，还是模型请求内容。

对应源码：[Context 的代理与内置服务](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/vendor/cordis/src/context.ts#L35-L83)、[插件实例上下文](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/vendor/cordis/src/fiber.ts#L238-L265)。

## 第三个观察：卸载会撤销贡献

消费方激活时，实验注册了一个 effect：

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

effect 主体立即执行。返回的函数是 disposer，Cordis 在所属插件卸载时调用它；该 disposer 可以是异步函数。

这里用日志与计数器观察生命周期，没有真的打开文件或连接。实际插件如果创建 watcher、连接等框架未管理的资源，可以在 effect 中获取，并在 disposer 中释放。

随后执行：

```js
await provider.dispose()
```

提供方变得不可用，消费方卸载自己的 effect，输出 `effect: released`。提供方卸载等待相关清理完成；此时服务查询为空，消费方回到 `PENDING`。

**消费方没有被永久 dispose。** 它仍保留挂载关系，只是所需依赖缺失。实验重新挂载 `TutorialGreeter` 后，消费方再次执行 `apply`，产生第二次问候与资源获取。

最后的 `root.fiber.dispose()` 撤销根所拥有的插件，第二次 effect 也被释放；脚本断言总获取与激活行为符合预期，且释放发生了两次。

对应源码：[effect 注册与清理](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/vendor/cordis/src/fiber.ts#L408-L424)、[依赖方与提供方的卸载顺序](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/vendor/cordis/src/fiber.ts#L712-L745)。

## 把实验对应回 DSH

DSH 的 `ctx.tools` 等能力沿用了同一套机制。例如，真实 `ToolsService.register()` 返回撤销工具注册的 disposer，并通过生命周期 effect 管理该贡献。

但不要据此把“撤销注册”等同于“已开始执行的任务自动取消”。在途请求是否中止，需要继续查看具体执行器、取消信号与资源清理实现。

另外，普通插件直接访问未声明依赖的服务可能报错。如果能力确实可选，可以用 `ctx.get('serviceName')` 探测，再处理缺失情况；仅添加 `?.` 不会绕过上下文的依赖访问规则。

对应源码：[工具注册的 effect](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/packages/core/tools/src/index.ts#L121-L152)、[服务属性读取规则](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/vendor/cordis/src/reflect.ts#L143-L179)、[可选服务查询](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/vendor/cordis/src/reflect.ts#L9-L19)。

## 动手验证

1. 注释掉首次提供方挂载及其后续步骤，只保留消费方与根清理。确认消费方从未执行，即使挂载语句用了 `await`。
2. 在消费方 disposer 里调用已注入的问候服务，观察提供方清理为何必须等待消费方结束。
3. 给 effect 的异步 disposer 加入短暂延迟，观察 `await provider.dispose()` 是否等到释放日志出现才继续。
4. 用自己的话解释：为什么替换服务后可以再次运行消费方，而显式 `consumer.dispose()` 后不能靠恢复服务自动重启它？

进一步阅读：[DSH 官方 Cordis 服务教程](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/docs/cordis-tutorial/03-services.zh.md)、[生命周期与 effect](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/docs/cordis-tutorial/02-lifecycle-and-effects.zh.md)。

[上一篇：Agent 执行链](02-agent-execution-chain.md) · [全景导读](00-harness-and-agent-loop.md)
