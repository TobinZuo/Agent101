# Observatory interaction contract

Product evidence: the user requested a Web project showing real code and actual execution logs; DSH behavior and sandbox boundaries are grounded in `labs/dsh/run-headless.mjs`, `labs/dsh/evidence/verification.json`, and `notes/dsh/01-first-task.md`. Visual decisions belong to [DESIGN.md](DESIGN.md).

## Scope and ownership

The application binds only to loopback and runs two allowlisted experiments. It accepts neither shell commands nor arbitrary file paths from a browser. Real DSH uses the existing fixed adapter, temporary workspace, isolated homes, workspace-write and never approval policy. No provider credential or paid model request is part of this version.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Select/Listbox | Native source-file select | DESIGN.md | OS-owned popup | Browser keyboard and narrow view |
| Scrollbar | tokens.css / app.css | DESIGN.md | Source and console geometry | Browser computed style |
| Toast | Stable #notice status | This contract | Info / error / completed | Browser + API failure tests |
| Navigation | Lesson anchors + URL state | This contract | Execution / plugins | Browser locale and back navigation |
| Streaming | RunStore + EventSource adapter | API contract below | Live / verified replay | API integration + browser |

## Run flow

Start → pending creation → server confirms run id → stream events → completed / failed / cancelled. Only one active run per server, including replay; duplicate creation returns 409. A reconnect reads retained events without re-executing the task. Source requests are abortable and stale responses cannot replace a new selection.

Stop requests cancellation of the active owned child and waits for process settlement; it does not delete history. No confirmation for this reversible control. New run clears the current display only after creation succeeds. SSE errors preserve visible events and explain how to retry connection. A restarted server may no longer have a run; offer a new run rather than claim its outcome.

Live completion requires process success and experiment-owned validation. Replay completion means playback ended; it never claims a fresh task ran. Child diagnostics are kept separately from structured DSH events. Raw data is unchanged apart from explicit recorded-evidence normalization. Backend memory is bounded; raw run artifacts use temporary directories. No credentials are stored in browser persistence.

## Local API boundaries

GET metadata and sources are allowlisted. Mutations require application/json, a per-server token obtained by same-origin bootstrap, a permitted Host and same-origin Origin when present. No CORS grants. The server never interpolates browser input into a command or filesystem path. Only a run's owned process is eligible for cancellation.

## Navigation, locale and accessibility

Lesson and language are reflected in the URL; a run id permits reconnection while the server lives. Language is also stored locally with storage failure handled. zh-CN and en-US copy includes buttons, aria names, errors and status; raw source/event vocabulary stays original. Elapsed values use the active locale. No clock claims are made for recorded events without timestamps.

Both experiment screens use the same workbench. Empty/loading/success/failure/cancellation/missing-runtime states preserve primary controls and explain recovery. Keyboard focus is visible; all actions are native buttons or links. Event selection does not automatically scroll the document or steal keyboard focus. Narrow view preserves start, stop, source and logs. Page titles track lesson and locale. Read-only source is selectable and copyable.
