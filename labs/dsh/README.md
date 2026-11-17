# DSH 配套实验

[简体中文](README.md) | [English](README_EN.md) · [教程目录](../../notes/dsh/README.md)

需要 Node.js `>=24.9.0`。在本目录执行 `npm ci`，再选择实验：

| 命令 | 运行内容 | 对应教程 |
| --- | --- | --- |
| `npm run first-task` | 真实 headless profile、循环与 Shell；固定本地模型输出 | [第 01 篇](../../notes/dsh/01-first-task.md)、[第 02 篇](../../notes/dsh/02-agent-execution-chain.md) |
| `node cordis-demo.mjs /absolute/path/to/deepseek-harness` | 从固定 checkout 内存编译并运行真实 Cordis | [第 03 篇](../../notes/dsh/03-plugins-and-context.md) |

首次任务使用临时工作区与独立 DSH home，运行结束后保留事件与诊断，方便检查。不会调用真实模型；模拟适配器不解释任意提示词。真实 Web 模型体验另见第 01 篇。

`mock-llm.mjs` 改编自 DSH 官方测试，原始许可见 [UPSTREAM_LICENSE_DSH.txt](UPSTREAM_LICENSE_DSH.txt)。Cordis 实验不分发编译后的上游实现。

实际运行版本与结果见 [verification.json](evidence/verification.json)。锁文件固定的是依赖解析，不保证所有平台都具有相同的沙箱或原生组件能力。
