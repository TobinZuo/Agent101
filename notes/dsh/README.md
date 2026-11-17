# DSH 学习教程

[简体中文](README.md) | [English](README_EN.md) · [Agent101 首页](../../README.md)

沿着一个真实项目，逐层拆解 Agent 系统。每篇围绕一个问题：先看任务或实验，再解释机制，最后找到对应源码。建议从第 01 篇动手，遇到全局关系不清楚时回看第 00 篇。

## 已发布

| 篇目 | 核心问题 | 实践与证据 |
| --- | --- | --- |
| [00 · 全景导读](00-harness-and-agent-loop.md) | Harness 由哪些运行能力组成？ | 一张总图与 JavaScript 异步取消示例 |
| [01 · 启动与首次任务](01-first-task.md) | 怎样观察一次完整的文件读取任务？ | 真实 DSH + 固定模型适配器，无需 API Key |
| [02 · Agent 执行链](02-agent-execution-chain.md) | 输入怎样经过模型与工具再形成回复？ | 对照第 01 篇的事件，定位真实函数 |
| [03 · 插件与 ctx](03-plugins-and-context.md) | 能力怎样被安装、依赖和清理？ | 固定源码中的真实 Cordis 生命周期实验 |

中英文正文共用实验、依赖锁文件与验证记录。文字解释、源码确认和实际运行证据各自标明；模拟模型不被当成真实推理能力的证明。

## 共用环境

Node.js `>=24.9.0`，npm；完整 DSH 运行实验还需要本平台支持相应的 Shell、原生依赖和沙箱。先安装一次共用实验依赖：

```bash
cd labs/dsh
npm ci
npm run first-task
```

第 03 篇另需官方源码，checkout 本身无需安装依赖或构建。请在 Agent101 外准备：

```bash
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
git checkout --detach 38a6a5c965aa99ab525161efb7cc5cf1fe62fced
```

回到 Agent101 的 `labs/dsh`，执行：

```bash
node cordis-demo.mjs /absolute/path/to/deepseek-harness
```

把占位路径换成本机 checkout 的绝对路径。实验会核对提交和相关源码是否有修改，避免悄悄把新版实现当成本文基线。

## 后续主题

以下尚未发布，顺序可以根据读者问题调整：

| 篇目 | 要回答的问题 |
| --- | --- |
| 04 · 生命周期与取消 | 有请求或工具正在运行时，怎样停止和释放资源？ |
| 05 · Session 与模型上下文 | 哪些事实被保存，哪些内容真正发给模型？ |
| 06 · 动手扩展工具 | 一个新能力怎样进入真实的工具执行管线？ |
| 07 · 失败、恢复与验证 | 超时、异常或恢复之后，怎样判断结果可信？ |

反馈时请带上篇目、卡住的步骤、Node/DSH 版本和已脱敏的错误信息；也欢迎提出某个解释仍然不清楚的问题。
