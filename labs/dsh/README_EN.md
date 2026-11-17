# DSH Companion Experiments

[简体中文](README.md) | [English](README_EN.md) · [Tutorial index](../../notes/dsh/README_EN.md)

Requires Node.js `>=24.9.0`. Run `npm ci` in this directory, then choose an experiment:

| Command | Execution | Tutorial |
| --- | --- | --- |
| `npm run first-task` | Real headless profile, loop, and Shell with fixed local model output | [Chapter 01](../../notes/dsh/01-first-task.en.md), [chapter 02](../../notes/dsh/02-agent-execution-chain.en.md) |
| `node cordis-demo.mjs /absolute/path/to/deepseek-harness` | Real Cordis compiled in memory from a pinned checkout | [Chapter 03](../../notes/dsh/03-plugins-and-context.en.md) |

The first task uses a temporary workspace and separate DSH home. It retains events and diagnostics for inspection. No real model is called, and the mock adapter does not interpret arbitrary prompts. See chapter 01 for the separate real-model Web walkthrough.

`mock-llm.mjs` adapts an official DSH test; its license is included in [UPSTREAM_LICENSE_DSH.txt](UPSTREAM_LICENSE_DSH.txt). The Cordis experiment does not distribute compiled upstream code.

Actual versions and results are recorded in [verification.json](evidence/verification.json). The lockfile fixes dependency resolution; platform sandbox and native component support can still differ.
