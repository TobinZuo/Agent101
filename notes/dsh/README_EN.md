# Learning DSH

[简体中文](README.md) | [English](README_EN.md) · [Agent101 home](../../README_EN.md)

Understand agent systems through one real project. Each chapter answers one question: observe a task or experiment, explain the mechanism, then locate its source. Start hands-on with chapter 01; return to chapter 00 when you need the broader map.

## Web learning workbench

Prefer a browser? Follow the [Web workbench instructions](../../web/README_EN.md). From the repository root, run `npm run setup` then `npm start`, and open <http://127.0.0.1:4173>. Live DSH/Cordis runs show raw logs beside source and explanations; recorded replay is explicitly labeled.

## Published chapters

| Chapter | Core question | Practice and evidence |
| --- | --- | --- |
| [00 · Overview](00-harness-and-agent-loop.en.md) | Which runtime capabilities make up a harness? | A system map and JavaScript cancellation demonstration |
| [01 · Startup and first task](01-first-task.en.md) | How do we observe a complete file-reading task? | Real DSH with a fixed model adapter, without an API key |
| [02 · Agent execution chain](02-agent-execution-chain.en.md) | How does input pass through the model and tools to become a reply? | Map chapter 01 events to real functions |
| [03 · Plugins and ctx](03-plugins-and-context.en.md) | How are capabilities installed, depended on, and cleaned up? | A real Cordis lifecycle experiment from pinned source |

Both languages share experiments, a dependency lockfile, and verification records. Explanations, source-confirmed behavior, and execution evidence are labeled separately. A mock model does not establish real reasoning ability.

## Shared environment

Use Node.js `>=24.9.0` and npm. The full DSH experiment also needs supported Shell, native dependencies, and sandbox capabilities on your platform. Install shared lab dependencies once:

```bash
cd labs/dsh
npm ci
npm run first-task
```

Chapter 03 additionally needs the official source, without installing or building that checkout. Prepare it outside Agent101:

```bash
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
git checkout --detach 38a6a5c965aa99ab525161efb7cc5cf1fe62fced
```

Return to Agent101's `labs/dsh` and run:

```bash
node cordis-demo.mjs /absolute/path/to/deepseek-harness
```

Replace the placeholder with your checkout's absolute path. The experiment checks its revision and relevant source changes to avoid silently using a different implementation.

## Future topics

These are not yet published; their order may change based on reader questions:

| Chapter | Question |
| --- | --- |
| 04 · Lifecycle and cancellation | How are in-flight requests or tools stopped and resources released? |
| 05 · Session and model context | Which facts are saved, and which content reaches the model? |
| 06 · Extend a tool | How does a new capability enter the real tool pipeline? |
| 07 · Failure, recovery, and verification | How do we assess results after timeouts, errors, or recovery? |

For feedback, include the chapter, failing step, Node/DSH versions, and sanitized error information. Questions about unclear explanations are welcome too.
