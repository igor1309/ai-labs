---
date: 2026-09-24
model: gpt-6-luna
---

# How agent orchestrators connect to local Codex and Claude Code runtimes

**Research date:** 2026-09-24  
**Catalog used:** [`andyrewlee/awesome-agent-orchestrators`](https://github.com/andyrewlee/awesome-agent-orchestrators/tree/3cc41651e8eed2455641ff0063550aa69906746c) at commit `3cc41651e8eed2455641ff0063550aa69906746c`

## Executive summary

Local coding-agent orchestrators use five recurring integration patterns:

1. **Own an interactive TUI through a PTY, usually kept alive by tmux.** The orchestrator knows the tmux session or PTY, but may not know the provider's conversation ID. Claude Squad is the clearest minimal version; Agent Deck and MulmoTerminal add hooks, transcript parsing, and native session IDs.
2. **Discover provider-owned transcript files and resume the native UI.** Agent Console scans Claude and Codex state directories, extracts the provider session ID, and launches the provider's native resume command. This can find sessions created outside the orchestrator, but cannot attach to an already-running external PTY.
3. **Run a headless CLI and parse a structured event stream.** Takopi, Ralphex, and Codex's own non-interactive interface use JSONL or stream-JSON. This is much more reliable than terminal scraping for turn progress and failure classification.
4. **Keep a structured protocol process alive.** Takopi and Symphony use Codex app-server over stdio JSON-RPC. Sandbox Agent wraps coding agents behind a local HTTP/SSE daemon and an Agent Client Protocol (ACP) adapter process.
5. **Treat the workspace or issue tracker as the durable task anchor.** Symphony is the strongest example: one Codex thread handles several turns, but the tracker decides whether the work is actually complete. If the worker dies, the orchestrator retries from durable task and workspace state rather than assuming that a clean agent exit means success.

The most important design conclusion is that **there is no single “session ID.”** A robust orchestrator should keep at least four references:

| Reference | What it identifies | Typical examples | Survives orchestrator restart? |
|---|---|---|---|
| Orchestrator run | The product's logical task/run | UUID, DB row, Telegram topic | Yes, if persisted |
| Provider conversation | Model-side conversational continuity | Codex `thread.id`; Claude `session_id` | Usually, if provider transcript/state remains |
| Live transport | The currently running runtime | PID, process group, PTY, tmux name, app-server connection | Normally no; tmux is the notable exception |
| Workspace | The durable side effects and recovery context | cwd, git worktree, branch, sandbox ID | Yes, if storage remains |

Do not overload one identifier to mean all four. A process can die while the provider conversation remains resumable; a tmux client can disconnect while the agent continues; a model turn can complete while the task is still unfinished; and a workspace can survive even if both process and conversation are lost.

## Scope and method

The catalog was used as the project universe. I selected eight open-source implementations that expose materially different local-runtime designs and inspected their source at pinned commits:

| Project | Commit |
|---|---|
| [agent-console](https://github.com/buhuipao/agent-console/tree/85774142458b42081a801cda8f9bf74886306baa) | `85774142458b42081a801cda8f9bf74886306baa` |
| [agent-deck](https://github.com/asheshgoplani/agent-deck/tree/3b41e36de82d89f84a951e5c0f490fc6e1973c41) | `3b41e36de82d89f84a951e5c0f490fc6e1973c41` |
| [claude-squad](https://github.com/smtg-ai/claude-squad/tree/ce1ffb4392b01f38e2c4599c7c84d2a93973b138) | `ce1ffb4392b01f38e2c4599c7c84d2a93973b138` |
| [MulmoTerminal](https://github.com/receptron/mulmoterminal/tree/29b3777e86938f31b956bcf576f046e94f29b5b6) | `29b3777e86938f31b956bcf576f046e94f29b5b6` |
| [Takopi](https://github.com/banteg/takopi/tree/e0123d4f9b2588bf45ec7250ad648c324e20ce20) | `e0123d4f9b2588bf45ec7250ad648c324e20ce20` |
| [ralphex](https://github.com/umputun/ralphex/tree/a736d5ede42fe0deae16e7b28cdae1ee912be6d0) | `a736d5ede42fe0deae16e7b28cdae1ee912be6d0` |
| [Symphony](https://github.com/openai/symphony/tree/be10a1b79df723d6d7612b5651c8522704dafb2e) | `be10a1b79df723d6d7612b5651c8522704dafb2e` |
| [Sandbox Agent](https://github.com/rivet-dev/sandbox-agent/tree/bbc195cc3fb5a1dd9cb05d8437442768c511e17e) | `bbc195cc3fb5a1dd9cb05d8437442768c511e17e` |

The survey is representative, not a claim that every catalog entry was source-audited. Pure launchers, cloud-only platforms, unavailable source, and projects that repeated an already-covered integration pattern were not included.

## Provider-native contracts

Live observations of session IDs, in-place resume and the Codex read-only
sandbox (codex-cli 0.159.2, Claude Code 2.1.285, 2026-09-30) are in
[session resume observations](session-resume-observations.md).

### Codex

Codex exposes three progressively richer local interfaces:

- **`codex exec --json`** emits newline-delimited JSON events for a non-interactive run. A conversation can be continued with `codex exec resume <SESSION_ID>` or `--last`. This is appropriate for batch jobs and simple supervisors. See [Codex non-interactive commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli).
- **Codex SDK** exposes a thread object whose `id` can be persisted and passed to `resumeThread(threadId)`. See the [Codex SDK guide](https://learn.chatgpt.com/docs/codex-sdk).
- **`codex app-server`** is a long-lived JSON-RPC protocol over stdio by default. Clients initialize, call `thread/start` or `thread/resume`, then `turn/start`, and receive item and turn notifications. `turn/completed` explicitly distinguishes `completed`, `interrupted`, and `failed`. See the [Codex app-server protocol](https://learn.chatgpt.com/docs/app-server).

The app-server distinction between `thread.id` and `thread.sessionId` matters. `thread.id` is the resumable thread identity. `thread.sessionId` identifies the root session tree and remains shared by forks; clients should not derive one from the other.

### Claude Code

Claude Code provides a comparable set of building blocks:

- **Interactive CLI:** `claude --resume <session-id>` resumes a conversation. Current Claude Code also has background-agent commands such as `--bg`, `agents`, and `attach`, although many third-party tools still use tmux so they can own the terminal independently. See the [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference).
- **Headless stream:** `claude -p --output-format stream-json` emits structured output. `--session-id` supplies an ID for a new session and `--resume` continues an existing one. The CLI also supports hook-event and partial-message output.
- **Agent SDK:** the terminal `ResultMessage` contains `session_id`; the SDK can continue, resume, or fork a session. A structured failure result may still contain a session ID, while a process or connection failure before a result may not. Local sessions are normally stored under `~/.claude/projects/<encoded-cwd>/*.jsonl`; custom session stores support other persistence models. See [Claude Agent SDK sessions](https://code.claude.com/docs/en/agent-sdk/sessions).
- **Hooks:** `SessionStart`, `UserPromptSubmit`, `PermissionRequest`, `Notification`, `Stop`, `SessionEnd`, and related hooks provide an out-of-band lifecycle channel. `Stop` means an agent turn stopped; it does not prove the user's overall task is accepted or complete. See the [Claude Code hooks guide](https://code.claude.com/docs/en/hooks-guide).

## Comparison matrix

| Orchestrator | Runtime connection | References held | Progress signal | Completion/failure signal | Restart behavior |
|---|---|---|---|---|---|
| Claude Squad | Agent TUI inside detached tmux | Internal record + tmux name + worktree; no provider session ID | Captured terminal pane hash and prompt-text heuristics | tmux liveness and prompt detection; no structured provider result | Reattaches if tmux lives. If it died, preserves worktree but starts a new agent conversation |
| Agent Deck | TUI inside tmux, with injected Claude hooks | Internal UUID, tmux name, Claude/Codex native IDs in SQLite and tmux environment | Hooks first; tmux pane/liveness and terminal patterns as fallback | Exact pane exit code when `remain-on-exit` is available; hook state helps classify clean stop vs error | Reattaches tmux; can resume by persisted native ID |
| Agent Console | Launches owned PTY; also discovers provider transcript stores | Stable key `provider:provider-session-id`, native ID, transcript path, cwd, optional managed PTY | Normalized hooks/events for owned sessions; transcript metadata for discovery | Hook events plus PTY `try_wait`; status is deterministically reduced | Rediscovers external/local history and launches native `codex resume` / `claude --resume`; cannot live-attach an external terminal |
| MulmoTerminal | Real PTY attached to tmux per cell | Orchestrator UUID, tmux name, Claude session ID or mapped Codex rollout ID, worktree | Claude hooks; Codex rollout JSONL tail; PTY/tmux state | Claude `Stop` / notifications; Codex `task_started`, `task_complete`, `turn_aborted`; PTY exit reconciled against tmux liveness | tmux survives UI/server disconnects; persisted activity and Codex ID mapping restore state |
| Takopi | Headless Claude stream-JSON, Codex JSONL, or long-lived Codex app-server | Typed `(engine, provider-id)` resume token; current Codex turn ID; process/app-server handle | Structured normalized `Started`, `Action`, and item events | Structured result/turn status; app-server EOF fails pending calls; cancellation interrupts current turn | Persists/returns provider token; serializes concurrent access to the same provider session |
| ralphex | Fresh headless subprocess for each plan task | Process/process-group and a transient Codex ID used to locate rollout telemetry | Stdout/stderr plus Codex rollout tail; idle timer resets on output | Explicit output markers, structured result/error, timeout, cancellation, and exit code | Intentionally starts a fresh provider session per task; durable plan/repo state drives retries |
| Symphony | One Codex app-server subprocess and thread per tracked issue run | Worker PID/monitor, app-server Port, Codex thread ID, current turn ID, workspace, tracker issue | App-server notifications update last-activity time | `turn/completed`, `turn/failed`, `turn/cancelled`, port exit, timeout; tracker decides task completion | Abnormal worker death triggers backoff/retry from issue + workspace; provider conversation is not the sole recovery anchor |
| Sandbox Agent | Local HTTP/SSE server spawning an ACP adapter/agent subprocess | Local session ID, runtime `agentSessionId`, connection ID, sandbox ID, ordered event index | JSON-RPC/ACP events normalized and streamed over SSE; persisted event history | Request timeout, process exit code/stderr, stop reason, server health checks | Can restart server; stale session restore creates a fresh runtime session and injects bounded event replay as context |

## Source-level case studies

### 1. Claude Squad: tmux is the session

Claude Squad's persisted session contains a title, path, branch, program, and status, but no Claude/Codex-native conversation identifier ([session model](https://github.com/smtg-ai/claude-squad/blob/ce1ffb4392b01f38e2c4599c7c84d2a93973b138/session/instance.go#L18-L69), [storage model](https://github.com/smtg-ai/claude-squad/blob/ce1ffb4392b01f38e2c4599c7c84d2a93973b138/session/storage.go#L10-L25)). The durable live handle is a sanitized tmux name such as `claudesquad_<title>` ([tmux naming](https://github.com/smtg-ai/claude-squad/blob/ce1ffb4392b01f38e2c4599c7c84d2a93973b138/session/tmux/tmux.go#L60-L72)).

Progress is inferred by capturing the pane, hashing its contents, and matching hard-coded prompt strings ([pane-status detection](https://github.com/smtg-ai/claude-squad/blob/ce1ffb4392b01f38e2c4599c7c84d2a93973b138/session/tmux/tmux.go#L244-L267)). If tmux disappeared across restart, the run becomes paused while the worktree remains ([restore behavior](https://github.com/smtg-ai/claude-squad/blob/ce1ffb4392b01f38e2c4599c7c84d2a93973b138/session/instance.go#L248-L259)).

**Implication:** this is simple and preserves a live TUI well, but screen text is a weak lifecycle API. After tmux loss, filesystem state survives but conversational continuity is not guaranteed.

### 2. Agent Deck: internal identity plus native identity

Agent Deck explicitly separates its own instance ID from Claude and Codex session IDs ([identity fields](https://github.com/asheshgoplani/agent-deck/blob/3b41e36de82d89f84a951e5c0f490fc6e1973c41/internal/session/instance.go#L137-L150), [native ID accessors](https://github.com/asheshgoplani/agent-deck/blob/3b41e36de82d89f84a951e5c0f490fc6e1973c41/internal/session/instance.go#L272-L318)). SQLite persists the tmux name and provider-specific IDs ([stored session shape](https://github.com/asheshgoplani/agent-deck/blob/3b41e36de82d89f84a951e5c0f490fc6e1973c41/internal/session/storage.go#L70-L140), [tool-data persistence](https://github.com/asheshgoplani/agent-deck/blob/3b41e36de82d89f84a951e5c0f490fc6e1973c41/internal/session/storage.go#L1037-L1149)).

It injects Claude hooks for session start, prompt submission, stop, permission requests, notifications, session end, and pre-compact ([hook configuration](https://github.com/asheshgoplani/agent-deck/blob/3b41e36de82d89f84a951e5c0f490fc6e1973c41/internal/session/claude_hooks.go#L250-L275)). Fresh hook events take precedence; terminal capture is a fallback. On process death, the classifier uses tmux's pane-dead status when available: exit 0 becomes stopped, non-zero becomes error, while missing exit evidence is retained as an unknown/error case rather than invented as success ([termination classification](https://github.com/asheshgoplani/agent-deck/blob/3b41e36de82d89f84a951e5c0f490fc6e1973c41/internal/session/instance.go#L6081-L6195), [tmux exit-code capture](https://github.com/asheshgoplani/agent-deck/blob/3b41e36de82d89f84a951e5c0f490fc6e1973c41/internal/tmux/tmux.go#L3266-L3304)).

**Implication:** keep an orchestrator-owned primary key and provider-native IDs as typed foreign references. Never make a terminal name the only identity.

### 3. Agent Console: provider transcript discovery

Agent Console's stable key is `<provider>:<provider-session-id>` ([specification](https://github.com/buhuipao/agent-console/blob/85774142458b42081a801cda8f9bf74886306baa/SPECS.md#L175-L206)). For Codex it scans `$CODEX_HOME/sessions` or `~/.codex/sessions`, reads `session_meta`, and can enrich metadata from SQLite. For Claude it scans `~/.claude/projects` and reads the transcript's `sessionId`; it then launches `codex resume -C <cwd> <id>` or `claude --resume <id>` ([provider discovery and resume](https://github.com/buhuipao/agent-console/blob/85774142458b42081a801cda8f9bf74886306baa/SPECS.md#L229-L294)).

Status is reduced from normalized events using a documented priority—waiting, working, failed, idle—and transcript mtime alone is deliberately not treated as proof that a session is attachable ([status model](https://github.com/buhuipao/agent-console/blob/85774142458b42081a801cda8f9bf74886306baa/SPECS.md#L333-L373), [implementation](https://github.com/buhuipao/agent-console/blob/85774142458b42081a801cda8f9bf74886306baa/src/model.rs#L41-L123)). Owned PTYs are monitored with `try_wait` for exit evidence ([PTY exit check](https://github.com/buhuipao/agent-console/blob/85774142458b42081a801cda8f9bf74886306baa/src/pty.rs#L806-L823)).

**Implication:** provider transcripts are an excellent discovery and recovery index, but not a live process registry. “A transcript exists” and “a process is running” must remain separate facts.

### 4. MulmoTerminal: hybrid PTY, hooks, and rollout tails

Each MulmoTerminal cell has an orchestrator ID, PTY, WebSocket, buffer, cwd, activity state, tmux handle, and agent type ([runtime entry](https://github.com/receptron/mulmoterminal/blob/29b3777e86938f31b956bcf576f046e94f29b5b6/server/session/types.ts#L18-L49)). Tmux is opened with create-or-attach behavior, so the browser/server connection can be replaced without killing the agent ([PTY/tmux spawn](https://github.com/receptron/mulmoterminal/blob/29b3777e86938f31b956bcf576f046e94f29b5b6/server/session/pty-spawn.ts#L165-L235)). A PTY client exit is not considered agent death if tmux is still alive ([exit reconciliation](https://github.com/receptron/mulmoterminal/blob/29b3777e86938f31b956bcf576f046e94f29b5b6/server/session/pty-exit.ts#L1-L58)).

Claude progress comes from hooks: prompt/tool activity means working, `Stop` means done/unreviewed, and relevant notifications mean blocked ([Claude activity hook](https://github.com/receptron/mulmoterminal/blob/29b3777e86938f31b956bcf576f046e94f29b5b6/server/session/activity-hook.ts#L14-L56)). Codex has no equivalent hook in this integration, so it tails rollout JSONL and maps `task_started`, `task_complete`, and `turn_aborted` to lifecycle transitions; the code explicitly notes that it cannot reliably detect blocked-on-input from this source ([Codex activity adapter](https://github.com/receptron/mulmoterminal/blob/29b3777e86938f31b956bcf576f046e94f29b5b6/server/agents/codex-activity.ts#L1-L78)).

Codex's minted rollout ID is discovered after launch and mapped back to the orchestrator ID. Attribution is fail-closed: it accepts only an unambiguous new rollout or exact cwd match rather than guessing ([spawn and mapping](https://github.com/receptron/mulmoterminal/blob/29b3777e86938f31b956bcf576f046e94f29b5b6/server/session/spawn-codex.ts#L34-L146), [attribution algorithm](https://github.com/receptron/mulmoterminal/blob/29b3777e86938f31b956bcf576f046e94f29b5b6/server/agents/codex-session.ts#L91-L160)).

**Implication:** a hybrid integration can retain the native TUI while adding reliable status, but every signal needs a documented capability boundary. Unknown/unsupported states should remain unknown.

### 5. Takopi: protocol-first normalization

Takopi models continuation as a typed `ResumeToken(engine, value)` and maps provider streams into normalized `Started`, `Action`, and `Completed` events ([event model](https://github.com/banteg/takopi/blob/e0123d4f9b2588bf45ec7250ad648c324e20ce20/src/takopi/model.py#L8-L74)). Claude's initial system event supplies `session_id`; the runner invokes `claude -p --output-format stream-json --verbose` and adds `--resume` when continuing ([Claude mapping](https://github.com/banteg/takopi/blob/e0123d4f9b2588bf45ec7250ad648c324e20ce20/src/takopi/runners/claude.py#L157-L318)). Codex exec maps `thread.started` to the same token shape and uses `codex exec --json` / `resume` ([Codex exec mapping](https://github.com/banteg/takopi/blob/e0123d4f9b2588bf45ec7250ad648c324e20ce20/src/takopi/runners/codex.py#L428-L507)).

Its richer default Codex path starts `codex app-server`, performs JSON-RPC initialization, starts or resumes a thread, starts a turn, and retains the turn ID for steer/interrupt control ([app-server startup](https://github.com/banteg/takopi/blob/e0123d4f9b2588bf45ec7250ad648c324e20ce20/src/takopi/runners/codex.py#L682-L829)). If the app-server stream closes, all pending calls fail; `turn/completed` status is mapped into a normalized terminal event ([reader and failure handling](https://github.com/banteg/takopi/blob/e0123d4f9b2588bf45ec7250ad648c324e20ce20/src/takopi/runners/codex.py#L838-L928), [completion mapping](https://github.com/banteg/takopi/blob/e0123d4f9b2588bf45ec7250ad648c324e20ce20/src/takopi/runners/codex.py#L1256-L1360)). Per-session locks prevent two prompts from racing on the same provider conversation ([session locking](https://github.com/banteg/takopi/blob/e0123d4f9b2588bf45ec7250ad648c324e20ce20/src/takopi/runner.py#L55-L119)).

**Implication:** this is the best small reference for an adapter boundary. Provider IDs are opaque typed values, events are normalized once, and transport closure deterministically fails outstanding work.

### 6. ralphex: durable workflow, intentionally disposable conversations

Ralphex runs each plan task in a fresh provider session. Its generic executor owns a subprocess and process group so cancellation can terminate the whole tree ([process execution](https://github.com/umputun/ralphex/blob/a736d5ede42fe0deae16e7b28cdae1ee912be6d0/pkg/executor/executor.go#L99-L154)). Claude is run with stream-JSON; an idle timeout is reset by output, and structured error evidence, cancellation, timeout, and non-zero exit are reconciled in a defined order ([Claude execution](https://github.com/umputun/ralphex/blob/a736d5ede42fe0deae16e7b28cdae1ee912be6d0/pkg/executor/executor.go#L342-L468)).

For Codex, stdout/stderr and a rollout tail provide progress. The Codex session ID is extracted mainly to locate the rollout file; it is not the durable task identity or a cross-task resume token ([Codex execution](https://github.com/umputun/ralphex/blob/a736d5ede42fe0deae16e7b28cdae1ee912be6d0/pkg/executor/codex.go#L157-L325), [session extraction and rollout tail](https://github.com/umputun/ralphex/blob/a736d5ede42fe0deae16e7b28cdae1ee912be6d0/pkg/executor/codex.go#L450-L622)).

**Implication:** provider-session continuity is optional when the real recovery model is a durable plan plus repository state. For autonomous workflows, short disposable agent turns can reduce corruption and simplify retry semantics.

### 7. Symphony: turn lifecycle is not task lifecycle

Symphony keeps a Codex app-server Port, protocol metadata, thread ID, and workspace in a session structure ([session state](https://github.com/openai/symphony/blob/be10a1b79df723d6d7612b5651c8522704dafb2e/elixir/lib/symphony_elixir/codex/app_server.ex#L1-L67)). It initializes app-server, starts a thread, and starts turns over stdio JSON-RPC ([protocol setup](https://github.com/openai/symphony/blob/be10a1b79df723d6d7612b5651c8522704dafb2e/elixir/lib/symphony_elixir/codex/app_server.ex#L192-L365)). The receive loop distinguishes `turn/completed`, failure/cancellation, port exit, and turn timeout; approval or user-input requirements are surfaced as blockers rather than silently treated as progress ([terminal events](https://github.com/openai/symphony/blob/be10a1b79df723d6d7612b5651c8522704dafb2e/elixir/lib/symphony_elixir/codex/app_server.ex#L368-L560)).

One issue run can contain several turns in the same Codex thread. After a turn, Symphony refreshes the tracker and continues if the issue is still active ([multi-turn issue loop](https://github.com/openai/symphony/blob/be10a1b79df723d6d7612b5651c8522704dafb2e/elixir/lib/symphony_elixir/agent_runner.ex#L88-L140)). The orchestrator monitors workers with process monitors; abnormal death causes retry/backoff, while a stalled worker is terminated unless it is known to be waiting for input ([worker monitoring](https://github.com/openai/symphony/blob/be10a1b79df723d6d7612b5651c8522704dafb2e/elixir/lib/symphony_elixir/orchestrator.ex#L128-L253), [stall handling](https://github.com/openai/symphony/blob/be10a1b79df723d6d7612b5651c8522704dafb2e/elixir/lib/symphony_elixir/orchestrator.ex#L581-L638)).

**Implication:** `turn/completed` means the provider finished a turn, not that the tracked issue passed acceptance criteria. Task completion belongs to a workflow layer above the agent protocol.

### 8. Sandbox Agent: daemon, dual IDs, ordered events, semantic restore

Sandbox Agent runs an HTTP server inside the sandbox; the server spawns and stops agent processes, routes prompts, and streams events. Each session maps to one agent process ([architecture](https://github.com/rivet-dev/sandbox-agent/blob/bbc195cc3fb5a1dd9cb05d8437442768c511e17e/docs/architecture.mdx#L6-L45)). Its ACP adapter owns child stdin/stdout/stderr, pending JSON-RPC requests, a monotonic sequence, broadcast channel, replay ring, and process-exit watcher ([adapter runtime](https://github.com/rivet-dev/sandbox-agent/blob/bbc195cc3fb5a1dd9cb05d8437442768c511e17e/server/packages/acp-http-adapter/src/process.rs#L18-L137)). SSE clients can reconnect with a last-event ID and receive buffered events before the live stream ([ordered replay stream](https://github.com/rivet-dev/sandbox-agent/blob/bbc195cc3fb5a1dd9cb05d8437442768c511e17e/server/packages/acp-http-adapter/src/process.rs#L257-L321)).

The SDK exposes both a local `session.id` and runtime `agentSessionId`, and events carry an ordered `eventIndex` ([session API](https://github.com/rivet-dev/sandbox-agent/blob/bbc195cc3fb5a1dd9cb05d8437442768c511e17e/docs/agent-sessions.mdx#L8-L52)). Persistence stores `SessionRecord(id, agent, agentSessionId, lastConnectionId, …)` plus events containing `eventIndex`, `sessionId`, and `connectionId` ([persistence shape](https://github.com/rivet-dev/sandbox-agent/blob/bbc195cc3fb5a1dd9cb05d8437442768c511e17e/docs/session-persistence.mdx#L7-L15)).

Its stale-session recovery is important to interpret correctly: it creates a fresh runtime session, rebinds the same local ID to the new runtime ID, and injects bounded recent event history into the next prompt ([session restoration](https://github.com/rivet-dev/sandbox-agent/blob/bbc195cc3fb5a1dd9cb05d8437442768c511e17e/docs/session-restoration.mdx#L6-L27)). That preserves semantic context, but it is not the same as resuming the provider's original native conversation.

**Implication:** add a connection/attempt epoch and an ordered event cursor. Stable product identity can span multiple disposable runtime sessions, as long as the continuity method is explicit (`native_resume` versus `context_replay`).

## What lifecycle signals actually prove

Lifecycle evidence should be ranked by meaning, not just availability:

| Signal | What it proves | What it does **not** prove |
|---|---|---|
| Structured `turn/completed` / result | The provider ended this turn with a stated status | The repository is correct; the issue is accepted; the process will remain alive |
| Permission/input hook | The runtime needs external attention | That it is stalled or broken |
| Tool/item event | Work progressed at a point in time | That useful progress continues afterward |
| Process exit code | The transport process ended, sometimes with OS-level success/failure | That the model completed its turn; exit 0 can still follow incomplete work |
| PTY disconnect | One terminal client disappeared | That a tmux-hosted agent died |
| Heartbeat/activity timeout | No observed evidence arrived within a policy window | Whether the agent is thinking, blocked, disconnected, or dead |
| Transcript mtime / terminal text changed | Provider state or visible output changed | Which turn it belongs to; whether the session is still live |
| Tracker status/tests/acceptance checks | Workflow-level task state | Whether a provider conversation remains resumable |

A practical precedence rule is:

1. Use structured provider terminal events for **turn** outcome.
2. Use hooks or protocol requests for **attention** state.
3. Use process/tmux supervision for **transport** outcome.
4. Use heartbeat and output timestamps only for **suspected stall**.
5. Use tests, tracker state, or explicit acceptance criteria for **task** outcome.

Never rewrite an explicit provider failure into success because the subprocess later exits 0. Conversely, a transient adapter or PTY disconnect should not mark the agent dead until the underlying tmux/process/server is checked.

## Recommended model for Agister

### 1. Persist separate identities

Suggested minimum schema:

```text
runs
  id                    # Agister logical run UUID
  provider              # codex | claude
  workspace_id/path
  task_ref               # issue/job/user task
  task_state

provider_sessions
  run_id
  provider_session_id    # opaque, nullable until emitted
  provider_thread_id     # separate field where protocol exposes it
  root_session_id        # optional grouping/fork identity
  continuity_mode        # native_resume | context_replay | none

runtime_attempts
  id
  run_id
  attempt_no
  transport_kind         # process | pty | tmux | app_server | daemon
  transport_ref          # pid/pgid/tmux name/connection id
  started_at/exited_at
  exit_code/exit_signal

events
  run_id, attempt_id
  provider_sequence      # nullable
  orchestrator_sequence  # monotonic and mandatory
  source                 # protocol | hook | process | transcript | heuristic
  kind
  payload
  observed_at
```

Provider IDs must be opaque strings. Use `(provider, provider_session_id)` as a unique typed key, not a bare ID. Record when an ID was first observed and which attempt emitted it. If Codex app-server exposes both thread and root-session identities, store both rather than translating one into the other.

### 2. Model state as orthogonal dimensions

A single enum such as `running | stopped | failed` collapses too much. Prefer:

```text
transport:  starting | alive | exited | lost | unknown
turn:       none | running | completed | failed | interrupted | unknown
attention:  none | approval | user_input | review | unknown
task:       pending | active | verifying | succeeded | failed | cancelled
recovery:   not_needed | resumable | retrying | replaying | exhausted
```

Derived UI labels can still be simple. For example, `transport=alive + attention=approval` becomes “Needs approval”; `transport=exited + turn=running` becomes “Crashed during turn”; `turn=completed + task=active` becomes “Turn complete, task continuing.”

### 3. Use an append-only event reducer

Normalize adapters into events such as:

```text
RUN_CREATED
PROCESS_STARTED
PROVIDER_SESSION_BOUND
TURN_STARTED
ITEM_STARTED / ITEM_UPDATED / ITEM_COMPLETED
WAITING_FOR_APPROVAL / WAITING_FOR_INPUT
TURN_COMPLETED / TURN_FAILED / TURN_INTERRUPTED
PROCESS_EXITED
HEARTBEAT_MISSED
WORKSPACE_CHECK_COMPLETED
TASK_COMPLETED / TASK_FAILED
```

Every event should include source and attempt/connection epoch. Recompute materialized state from events, and make reducers idempotent. This makes reconnection, duplicated SSE/JSONL messages, replay, and post-crash diagnosis tractable.

### 4. Prefer adapters in this order

For a new integration:

1. **Codex:** app-server for an interactive product; SDK when embedding in application code; `codex exec --json` for isolated batch jobs.
2. **Claude:** Agent SDK for an interactive/headless product; `claude -p --output-format stream-json` for batch jobs; hooks to capture permissions and waiting states.
3. **Native TUI requirement:** PTY + tmux, augmented with hooks and transcript/event tails. Treat screen parsing as last-resort evidence.
4. **Cross-runtime facade:** a daemon/ACP bridge can normalize multiple agents, but keep the native provider ID and distinguish native resume from prompt-history replay.

A small adapter interface is enough:

```text
start(run, prompt) -> attempt handle
resume(run, provider_session_id, prompt) -> attempt handle
send(attempt, prompt)
interrupt(attempt)
terminate(attempt)
events(attempt, after_cursor) -> ordered stream
snapshot(attempt) -> process/protocol health
```

### 5. Define crash and completion precisely

Recommended classifications:

- **Turn completed:** a structured provider terminal event says completed.
- **Turn failed:** a structured provider error/failure event, or a process exit before any terminal turn event.
- **Interrupted:** explicit user/orchestrator cancellation, even if the process exits non-zero afterward.
- **Transport crashed:** unexpected process/app-server exit; attach exit code, signal, stderr tail, and last event cursor.
- **Stalled:** runtime is still believed alive, no attention state is active, and no progress/heartbeat was observed for the policy interval. Stall is a suspicion, not a failure fact.
- **Task complete:** external workflow acceptance passed—tests, issue state, explicit user acceptance, or a deterministic completion check. Provider turn completion alone is insufficient.

On recovery, first determine whether the original transport is still alive (tmux/daemon), then whether the provider conversation can be natively resumed, then whether the workspace can continue with a fresh conversation, and finally whether bounded semantic replay is acceptable. Record which path was used.

## Design takeaways

- **Best identity model:** Agent Deck, Agent Console, and Sandbox Agent all demonstrate why internal, provider, and connection identifiers must be separate.
- **Best structured adapter reference:** Takopi's typed resume token and normalized events are compact and clear.
- **Best interactive durability pattern:** MulmoTerminal combines tmux survival with provider-specific lifecycle signals and fail-closed Codex transcript attribution.
- **Best workflow-level lifecycle model:** Symphony separates turn completion, worker death, stalls, and issue completion.
- **Best minimal baseline:** Claude Squad shows exactly what tmux alone buys—and what it cannot know.
- **Best example where session continuity is intentionally unnecessary:** ralphex relies on durable plan and repository state instead of long-lived conversations.

The recommended Agister architecture is therefore **protocol-first, event-sourced, and workspace-aware**, with PTY/tmux support as an optional interactive transport. Provider session IDs should enable continuity, not define the run; process handles should enable supervision, not define the conversation; and only the workflow layer should declare the user's task complete.
