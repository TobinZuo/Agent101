# Agent101 Observatory · Run, inspect, understand

[简体中文](README.md) | [English](README_EN.md)

Start a real experiment in your browser. Read its execution events beside pinned source code and explanations.

## Start

Requires **Node.js >=24.9.0** and npm. From the repository root:

```sh
npm run setup
npm start
```

Open <http://127.0.0.1:4173>. Future sessions only need `npm start`. Use `PORT=4174 npm start` in a POSIX shell for a different port; Ctrl+C stops the service. The frontend requires no build and no API key. Initial live runs include process startup time.

For recorded evidence only, skip dependency installation and select **Log replay**. The Web server still requires the Node version above.

## Learn by running

1. **Run your first task**: launch official DSH in a temporary fixture workspace to read README.md and package.json.
2. **Trace the agent loop**: select a stage or event to inspect its source range, raw JSON, explanation, and evidence boundary. Inspect the second step to see how Session facts connect model requests.
3. **Understand plugins & ctx**: run real Cordis and observe a consumer waiting for a service, activation, cleanup, and reactivation after replacement.

Diagnostics shows child stderr. Export downloads JSONL with mode, event sequence and relative receipt time. Manual event selection pauses following; **Follow latest** resumes it. Changing UI language preserves the run and events.

## What is real

| Part | Behavior and evidence boundary |
| --- | --- |
| Live file task | Starts a fresh official DSH headless process, agent loop and Shell tool. The fixture files are actually read. |
| Model adapter | Local fixed output requests the prescribed tool call, then returns actual tool text. It does not test remote model reasoning or arbitrary prompts. |
| Live plugin task | Compiles the source shipped in the installed Cordis 4.1.0 package in memory, then runs the shared exercise and assertions. |
| Log replay | Plays previously checked repository evidence. It does not execute a new task or claim fresh validation. Its clock is playback time. |
| Source association | Reviewed event-to-function teaching links, with explicit limits. These are not per-line instrumentation or a complete call stack. |

Live completion requires process success and experiment-specific validation, including actual file contents, linked tool calls/results and unchanged fixtures. Replay completion only means playback ended. Raw event data is preserved; prior normalization in recorded evidence is documented in the [lab](../labs/dsh/README_EN.md).

DSH is pinned to `0.2.2-rc.3`, Cordis to `4.1.0`. Upstream source snapshots reference [`38a6a5c`](https://github.com/deepseek-ai/deepseek-harness/tree/38a6a5c965aa99ab525161efb7cc5cf1fe62fced); `npm run check` verifies SHA-256 and teaching ranges. See [snapshots/license](sources/) and the [teaching manifest](sources/manifest.json). The published package and source checkout are separate inputs; byte-identical build equivalence is not claimed.

## Runtime and limitations

This is a **local Node server with a browser UI**. Static hosting such as GitHub Pages cannot start DSH processes. It binds only to loopback and supports personal local learning. Public hosting, authentication and multi-user isolation are not implemented.

Only two allowlisted experiments are accepted; browsers cannot supply commands or filesystem paths. Live runs use temporary workspaces, isolated DSH homes and the existing `workspace-write` / `never` configuration. This bounds the fixed experiment; it is not a general isolation service for untrusted code.

One experiment runs at a time. Stop, reconnect and refresh recovery are supported. The server retains the latest 12 runs in memory, up to 1500 events each; restarting loses that history. Runs time out after 65 seconds. Event time is relative receipt time at the Web backend, not function duration. Raw artifacts remain in system temporary directories named `agent101-web-*`; the exported complete event includes their location. Remove them yourself when no longer needed.

| Issue | Recovery |
| --- | --- |
| Runtime missing | Run `npm run setup` at the root and refresh, or use replay |
| Node too old | Switch to Node >=24.9.0 and restart |
| Another run is active | Attach, wait, or stop it before starting another |
| Stream interrupted | Existing events remain visible; reconnect without rerunning |
| Failure or timeout | Inspect Diagnostics and the raw complete event; retry after settlement |
| Run no longer exists | The server restarted or evicted it; start a new run |

## Verification and implementation

```sh
npm test
npm run check
npm run build
npm run verify:runtime  # Real DSH and Cordis; requires setup
```

[server.mjs](server.mjs) owns the local API and SSE; [runtime.mjs](runtime.mjs) starts child processes and validates results; [runs.mjs](runs.mjs) owns cancellation, limits and replay. [app.mjs](public/app.mjs) links events and source, while [model.mjs](public/model.mjs) contains teaching associations. See the [verification record](evidence/README.md) for observed results and limits.
