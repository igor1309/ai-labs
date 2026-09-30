---
date: 2026-09-28
author: Igor Malyarov
model: gpt-6-sol
---

# Runtime discussion

When Claude code runs it saves to session json file. Explore how different orchestrators approach live reading of it. Do they really read from this file or do they use some kind of different streaming machinery?
Say I launch session headlessly with `claude -p`

You have to ground your answer in real documents, do not answer from your memory

---

Yes. There are **two distinct data paths** in Claude Code, and real orchestrators use both depending on what they are trying to observe.

```text
                      live protocol
orchestrator ──stdin NDJSON──▶ Claude Code subprocess
             ◀─stdout NDJSON──
                                 │
                                 │ persistence
                                 ▼
                    ~/.claude/projects/.../<session>.jsonl
                                 │
                                 ▼
                         passive observers
```

### 1. For a process that launches `claude -p`, stdout is the intended live channel

Anthropic documents `--output-format stream-json` as **newline-delimited JSON for real-time streaming**. With `--include-partial-messages`, Claude emits token-level events as generation happens. The final NDJSON record is a `result` event.  [oai_citation:0‡Claude](https://code.claude.com/docs/en/headless)

So an orchestrator typically launches something like:

```bash
claude -p "do the task" \
  --output-format stream-json \
  --verbose \
  --include-partial-messages
```

Then it continuously reads the child's stdout.

For a long-lived, bidirectional session, the machinery looks more like:

```bash
claude -p \
  --input-format stream-json \
  --output-format stream-json \
  --verbose
```

The host writes NDJSON messages to stdin and receives NDJSON events over stdout.

This is exactly how Anthropic's **official Agent SDK** implements Claude Code. Its source builds the CLI command with:

```text
--output-format stream-json --verbose
...
--input-format stream-json
```

 [oai_citation:1‡GitHub](https://github.com/anthropics/claude-agent-sdk-python/blob/main/src/claude_agent_sdk/_internal/transport/subprocess_cli.py)

It then spawns Claude with actual OS pipes:

```text
stdin=PIPE
stdout=PIPE
```

and wraps stdout as a receive stream.  [oai_citation:2‡GitHub](https://github.com/anthropics/claude-agent-sdk-python/blob/main/src/claude_agent_sdk/_internal/transport/subprocess_cli.py)

The parser even describes its input explicitly as the CLI's **“NDJSON stdout.”**  [oai_citation:3‡GitHub](https://github.com/anthropics/claude-agent-sdk-python/blob/main/src/claude_agent_sdk/_internal/transport/subprocess_cli.py)

So for an orchestrator that owns the Claude process, the architecture is generally:

**subprocess pipes → streaming parser → orchestrator state/UI**

rather than waiting for filesystem updates.

---

### 2. The session JSONL is the durable transcript

Claude Code simultaneously writes:

```text
~/.claude/projects/<project>/<session>.jsonl
```

Anthropic describes this as the **full conversation transcript**, containing messages, tool calls and tool results.  [oai_citation:4‡Claude](https://code.claude.com/docs/en/claude-directory)

There is a particularly useful architectural clue in Anthropic's documentation: with `claude -p`, you can specify:

```bash
--no-session-persistence
```

which skips writing the transcript.  [oai_citation:5‡Claude](https://code.claude.com/docs/en/claude-directory)

The stdout streaming protocol still exists. So persistence and live delivery are separate mechanisms.

Conceptually:

| Surface | Purpose |
|---|---|
| stdout `stream-json` | live execution/event stream |
| stdin `stream-json` | live commands/control/input |
| session `.jsonl` | durable transcript, resume/history, cross-process observation |

---

### 3. `cc-connect`: live stream first, transcript as fallback

`cc-connect` is a particularly clear real-world example.

It starts Claude with:

```text
--output-format stream-json
--input-format stream-json
--permission-prompt-tool stdio
```

 [oai_citation:6‡GitHub](https://github.com/chenhg5/cc-connect/blob/main/agent/claudecode/session.go)

Its internal comments explicitly distinguish two sources for context usage:

- `"event"` — **live `stream-json` assistant event**, described by the project as its most faithful snapshot.
- `"transcript"` — usage recovered from the Claude Code JSONL when the live provider event lacks usable data.
- `"transcript-recovered"` — JSONL data loaded when attaching to a resumed session.  [oai_citation:7‡GitHub](https://github.com/chenhg5/cc-connect/blob/main/agent/claudecode/session.go)

And when it does use the transcript, it implements a targeted **tail read** of the JSONL rather than continuously rescanning the whole session.  [oai_citation:8‡GitHub](https://github.com/chenhg5/cc-connect/blob/main/agent/claudecode/session.go)

So its architecture is roughly:

```text
                   stdout stream-json ──▶ primary live state
Claude Code ──────┤
                   JSONL transcript ────▶ recovery / missing metadata
```

This is probably the most representative architecture for a serious orchestrator.

---

### 4. Happy: hybrid streaming + filesystem observation

Happy has another interesting hybrid.

Its source says:

> “SDK-emitted assistant + tool_result user messages keep flowing through the existing sdkToLogConverter pipeline”

while a separate session scanner watches the JSONL specifically for things that pipeline cannot see.  [oai_citation:9‡GitHub](https://github.com/slopus/happy/blob/main/packages/happy-cli/src/claude/runClaude.ts)

One concrete case is another terminal interacting with the same Claude session. A prompt entered through that other process gets persisted into the Claude JSONL, so Happy's filesystem scanner can notice it even though Happy did not receive that prompt through its own SDK process.

It therefore has two observation planes:

```text
SDK / Claude subprocess
        │
        ├── live SDK events ──────────▶ assistant/tool activity
        │
        └── Claude JSONL ◀──────────── external-session activity
                         filesystem scanner
```

That is useful when several frontends/processes can touch the same Claude session.

---

### 5. Passive monitors really do tail the file

There is also a separate class of tooling that does exactly what you suspected: **live-read the JSONL file**.

For example, `claude-watch` says it:

> “tails the most recent session's transcript”

and its architecture section states that Claude Code writes its session and subagent JSONLs and `claude-watch` **tails them, merges entries by timestamp, and derives its UI from them**. It requires no wrapper around the Claude process.  [oai_citation:10‡GitHub](https://github.com/rob-mcgrail/claude-watch)

This approach makes sense for an observer:

```text
terminal A: claude ...
terminal B: claude-watch

Claude ──append──▶ session.jsonl ──tail──▶ claude-watch
```

Because the observer does not own Claude's stdout pipe, the transcript provides a convenient cross-process event source.

---

## What this means for your `claude -p` launcher

If **your orchestrator is the thing launching Claude**, the clean architecture is:

```bash
claude -p ... \
  --output-format stream-json \
  --verbose \
  --include-partial-messages
```

and consume stdout incrementally.

Use the session JSONL for persistence-oriented functions such as:

- reconnect/resume recovery;
- historical reconstruction;
- observing activity performed through another Claude process;
- post-run analytics;
- filling occasional metadata gaps.

If your program is instead attaching to **an arbitrary Claude process it did not spawn**, tailing `~/.claude/projects/.../*.jsonl` becomes a practical live-observation mechanism.

The important fidelity difference is that `stream-json` has an explicitly documented **token-level event stream** (`stream_event` / text deltas), whereas the JSONL is documented as the persisted conversation transcript. Thus a responsive orchestrator UI normally consumes the pipe; a session viewer can work entirely from filesystem tailing.  [oai_citation:11‡Claude](https://code.claude.com/docs/en/headless)

If useful, I can next map the **exact event schemas** emitted on `stream-json` versus the records written into `<session>.jsonl`, including tool calls, tool results, subagents, usage and partial text.

---

Ok, and what about Codex?
And how can I build an abstraction above both, say streaming provider (or whatever name more appropriate) and build Claude code and codex adaptors

---

## Codex

Codex follows essentially the same separation as Claude Code.

For a headless invocation:

```bash
codex exec --json "do something"
```

`stdout` becomes a live JSONL event stream. OpenAI documents events including `thread.started`, `turn.started`, `item.started`, `item.completed`, `turn.completed`, failures, and errors.  [oai_citation:0‡OpenAI Developers](https://developers.openai.com/codex/noninteractive)

This is also how the official TypeScript Codex SDK works internally. Its README explicitly says it wraps the `codex` CLI and **exchanges JSONL events over stdin/stdout**; `runStreamed()` exposes those as an async generator.  [oai_citation:1‡GitHub](https://github.com/openai/codex/blob/main/sdk/typescript/README.md?utm_source=chatgpt.com)

Separately, Codex persists session rollouts under `~/.codex/sessions/.../rollout-*.jsonl`. The source describes those files as persisted session rollouts for replay/inspection.  [oai_citation:2‡GitHub](https://github.com/openai/codex/blob/main/codex-rs/rollout/src/recorder.rs?utm_source=chatgpt.com)

So:

```text
                  LIVE
your process ◀──────────── codex exec --json
             stdout JSONL
                    │
                    │ persistence
                    ▼
       ~/.codex/sessions/.../rollout-*.jsonl
```

I would consume the live protocol, rather than tailing the rollout.

### Codex has an even better integration surface

For a serious orchestrator, Codex exposes `codex app-server`.

It is a bidirectional protocol over stdio JSONL by default:

```text
your app ── JSON-RPC requests ──▶ codex app-server
         ◀── notifications ──────
```

It gives you explicit concepts of:

```text
Thread
  └── Turn
       └── Items
```

and supports starting/resuming threads, starting/steering/interruption of turns, approvals, and streamed events.  [oai_citation:3‡OpenAI Developers](https://developers.openai.com/codex/app-server)

The docs explicitly recommend App Server for custom clients that need authentication, conversation history, approvals, and streamed agent events.  [oai_citation:4‡OpenAI Developers](https://developers.openai.com/codex/sdk)

---

# The abstraction I would build

I would call it **`AgentRuntime`**, rather than `StreamingProvider`.

Streaming is just one property. You are really abstracting a **stateful coding-agent runtime**:

```text
                  AgentRuntime
                       │
             ┌─────────┴─────────┐
             │                   │
     ClaudeCodeRuntime      CodexRuntime
             │                   │
      Claude protocol      Codex protocol
```

Then expose three concepts:

```ts
interface AgentRuntime {
  createSession(options: SessionOptions): Promise<AgentSession>;
  resumeSession(ref: SessionRef): Promise<AgentSession>;
  capabilities: AgentCapabilities;
}

interface AgentSession {
  readonly ref: SessionRef;

  startTurn(input: AgentInput): Promise<AgentTurn>;

  close(): Promise<void>;
}

interface AgentTurn {
  readonly events: AsyncIterable<AgentEvent>;

  interrupt(): Promise<void>;
  steer?(input: AgentInput): Promise<void>;
}
```

The important part is that **the normalized event model belongs to you**.

Do not let Claude's `stream_event` or Codex's `item.completed` escape above the adapter.

---

## Event model

I would keep it fairly close to an event-sourced model:

```ts
type AgentEvent =
  | SessionStarted
  | TurnStarted
  | ItemStarted
  | ItemDelta
  | ItemCompleted
  | UsageUpdated
  | TurnCompleted
  | WarningEvent
  | ErrorEvent;
```

With:

```ts
interface BaseEvent {
  provider: "claude-code" | "codex";

  sessionId: string;
  turnId?: string;
  itemId?: string;

  // Adapter-assigned ordering.
  seq: number;

  // Keep escape hatch for provider-specific features.
  raw?: unknown;
}
```

And make **item** the common semantic primitive:

```ts
type AgentItem =
  | AssistantMessageItem
  | ReasoningItem
  | CommandItem
  | ToolCallItem
  | FileChangeItem
  | PlanItem
  | SubagentItem
  | UnknownItem;
```

For example:

```ts
interface ToolCallItem {
  kind: "tool_call";

  id: string;
  name: string;

  input?: unknown;
  output?: unknown;

  status: "running" | "completed" | "failed";
}
```

This shape fits both systems considerably better than trying to normalize everything into `"message"`.

Codex itself already models its stream around thread → turn → item and has item types such as agent message, reasoning, command execution, file change, MCP call, web search and plan.  [oai_citation:5‡OpenAI Developers](https://developers.openai.com/codex/app-server)

---

# Adapter mapping

Conceptually:

| Your event | Claude Code | Codex |
|---|---|---|
| `session.started` | `system/init` | `thread.started` |
| `turn.started` | inferred/start request | `turn.started` |
| `item.started` | content/tool start | `item.started` |
| `item.delta` | `stream_event` delta | item/message delta/update |
| `item.completed` | assistant/tool result | `item.completed` |
| `usage.updated` | usage/result metadata | token usage events |
| `turn.completed` | `result` | `turn.completed` |
| `error` | error/result failure | `turn.failed` / `error` |

Claude's documented `stream-json` mode emits token-level `stream_event`s and ends with a `result` carrying final response/session metadata.  [oai_citation:6‡Claude](https://code.claude.com/docs/en/headless)

Codex App Server emits turn/item lifecycle notifications and has a definitive `turn/completed` notification with `completed`, `interrupted`, or `failed` status.  [oai_citation:7‡OpenAI Developers](https://developers.openai.com/codex/app-server)

---

## One subtle design choice

Treat deltas as **previews**, and completed items as authoritative snapshots.

For example:

```text
item.started
item.delta  "Hel"
item.delta  "lo"
item.completed { text: "Hello" }
```

Your reducer does:

```ts
state = reduce(state, event)
```

and ultimately trusts `item.completed`.

This protects you against slightly different streaming behavior between providers and against missing/coalesced deltas.

---

# Session IDs should remain opaque

Use:

```ts
interface SessionRef {
  provider: "claude-code" | "codex";
  id: string;
}
```

For example:

```ts
{
  provider: "claude-code",
  id: "..."
}
```

versus:

```ts
{
  provider: "codex",
  id: "0199a213-..."
}
```

Then:

```ts
await runtime.resumeSession(ref)
```

The adapter knows whether that means Claude `--resume`, Codex `thread/resume`, `codex exec resume`, etc.

Your orchestration layer should never know about:

```text
~/.claude/projects/...
~/.codex/sessions/...
```

Those are implementation/persistence details.

---

# Two implementation levels

I would support these adapters:

```text
AgentRuntime
│
├── ClaudeCodeAdapter
│    └── Claude Agent SDK / claude -p stream-json
│
└── CodexAdapter
     └── codex app-server
```

For a smaller first implementation, both can simply be subprocess adapters:

```text
Claude:
claude -p ... --output-format stream-json
                       │
                       ▼
                 JSONL parser

Codex:
codex exec --json ...
                       │
                       ▼
                 JSONL parser
```

This is quite symmetric and is sufficient for **run → observe → finish → resume**.

For more sophisticated orchestration, I would upgrade the transports underneath without changing `AgentRuntime`:

```text
ClaudeCodeAdapter
    ↓
Claude Agent SDK

CodexAdapter
    ↓
Codex App Server
```

Codex App Server is specifically designed for this custom-client case and even lets you generate TS/JSON schemas matching the installed Codex version.  [oai_citation:8‡OpenAI Developers](https://developers.openai.com/codex/app-server)

---

## I would also add capability discovery

The vendors will never have identical functionality.

```ts
interface AgentCapabilities {
  resume: boolean;
  interrupt: boolean;
  steer: boolean;

  tokenDeltas: boolean;
  toolProgress: boolean;

  approvals: boolean;
  subagents: boolean;
}
```

Then orchestration can say:

```ts
if (session.capabilities.steer) {
  await turn.steer(...);
}
```

instead of encoding:

```ts
if (provider === "codex") ...
```

Claude already exposes protocol capabilities in its `system/init` event specifically so clients can feature-detect behavior instead of keying off version strings.  [oai_citation:9‡Claude](https://code.claude.com/docs/en/headless)

### The resulting architecture

```text
                       Your application
                              │
                    orchestration / UI
                              │
                       AgentRuntime
                              │
                    normalized events
                              │
             ┌────────────────┴────────────────┐
             │                                 │
      ClaudeCodeAdapter                  CodexAdapter
             │                                 │
       Agent SDK /                      app-server /
       stream-json                       exec --json
             │                                 │
             ▼                                 ▼
        Claude Code                          Codex

        provider-owned persistence below this boundary
```

The main architectural rule I'd use is:

**Normalize execution semantics, not wire formats.**

`session → turn → item → events` is a good common denominator. Keep each provider's raw event attached as an escape hatch, and let the adapter own all JSONL/process/session-file knowledge.

---

Ok, and for 2-way comm as opposed to one-shots I need some id how to Clyde Cade and codex solve this and how to reason about it on abstracted/generic way?

---

Yes. For 2-way operation, I would model **identity at several scopes**, rather than looking for one universal ID.

## 1. Conversation identity

This is the durable context you can resume later.

```ts
type SessionRef = {
  provider: "claude" | "codex";
  id: string;
};
```

Mapping:

| Generic | Claude Code | Codex |
|---|---|---|
| `sessionId` | `session_id` | `threadId` |

Claude exposes a UUID session ID and supports `resume=<session_id>`; `ClaudeSDKClient` maintains that conversation across repeated `query()` calls.  [oai_citation:0‡Claude Platform Docs](https://docs.anthropic.com/en/docs/claude-code/sdk/sdk-python)

Codex explicitly calls this a **thread**. `thread/start` returns its ID, and `thread/resume` takes that ID later.  [oai_citation:1‡OpenAI Developers](https://developers.openai.com/codex/app-server)

So at your abstraction boundary I would call it **session**, irrespective of the vendor terminology.

---

## 2. Execution identity

A conversation contains multiple user→agent executions:

```text
Session
 ├─ Turn 1
 ├─ Turn 2
 └─ Turn 3
```

Codex makes this explicit:

```text
threadId = thr_123
turnId   = turn_456
```

A `turn/start` returns a `turn.id`; steering and interruption target that active turn.  [oai_citation:2‡OpenAI Developers](https://developers.openai.com/codex/app-server)

Claude's public `ClaudeSDKClient` is less explicit. You do:

```python
await client.query("first")
receive_response()  # until ResultMessage

await client.query("second")
receive_response()
```

`receive_response()` defines the boundary by running until the corresponding `ResultMessage`; Claude exposes message UUIDs and session IDs, but the SDK API does not give each `query()` a Codex-style public `turnId`.  [oai_citation:3‡Claude Platform Docs](https://docs.anthropic.com/en/docs/claude-code/sdk/sdk-python)

### Therefore: mint your own turn ID

```ts
type TurnId = string;

interface AgentSession {
  send(input: AgentInput): Promise<AgentTurn>;
}

interface AgentTurn {
  id: TurnId;               // YOUR id
  providerTurnId?: string;  // Codex turnId when available

  events: AsyncIterable<AgentEvent>;

  interrupt(): Promise<void>;
}
```

For Claude:

```text
your turn:  t_abc
provider:   no equivalent required
```

For Codex:

```text
your turn:       t_abc
provider turn:   turn_456
```

This gives your application stable semantics independent of provider behavior.

---

# 3. Transport request identity

This is a different thing.

Codex App Server is RPC-like. Every command carries an `id`:

```json
{
  "method": "turn/start",
  "id": 30,
  "params": { ... }
}
```

and Codex answers:

```json
{
  "id": 30,
  "result": { ... }
}
```

That `30` correlates **the RPC request and response**. It is not the conversation or turn identity. Notifications have no request ID.  [oai_citation:4‡OpenAI Developers](https://developers.openai.com/codex/app-server)

So one Codex interaction can involve:

```text
requestId = 30
    │
    │ response
    ▼
threadId = thr_123
turnId   = turn_456
    │
    ├── event
    ├── event
    ├── event
    └── turn/completed
```

I would keep this below your adapter.

```ts
class CodexAdapter {
  private nextRpcId = 1;
  private pending = new Map<number, Deferred>();
}
```

Your orchestration layer shouldn't care that Codex happens to use JSON-RPC-style IDs.

Claude's SDK similarly hides its transport/control mechanics behind things like:

```python
client.query(...)
client.interrupt()
client.set_model(...)
```

so I would keep any Claude protocol-level correlation entirely inside the Claude adapter as well.  [oai_citation:5‡Claude Platform Docs](https://docs.anthropic.com/en/docs/claude-code/sdk/sdk-python)

---

# 4. Agent → user requests

This is the other half of "2-way".

The agent might stop and ask:

```text
"May I execute rm ...?"
"Which database should I use?"
"Approve this file change?"
```

That needs another identity:

```ts
interface InteractionRequest {
  id: string;             // normalized by you
  sessionId: string;
  turnId: string;

  kind:
    | "approval"
    | "user_input"
    | "tool_call";

  payload: unknown;
}
```

Codex models this very cleanly. The server can itself issue an RPC request to your client. Approval requests include `threadId`, `turnId`, and typically `itemId`; your response uses the server's RPC request ID.  [oai_citation:6‡OpenAI Developers](https://developers.openai.com/codex/app-server)

For example conceptually:

```text
Codex → you

requestId = 97
threadId  = thr_123
turnId    = turn_456
itemId    = item_789

"approve this command?"
```

Then:

```text
you → Codex

requestId = 97
decision = accept
```

Claude exposes this at the SDK level through callbacks such as `can_use_tool`, with a `tool_use_id` available in the callback context. Its `AskUserQuestion` tool similarly represents agent-requested user input.  [oai_citation:7‡Claude Platform Docs](https://docs.anthropic.com/en/docs/claude-code/sdk/sdk-python)

Again, your adapter can normalize both.

---

# The generic hierarchy I'd use

```text
AgentRuntime
    │
    ├── Session
    │     persistent conversation identity
    │
    └── Turn
          one user-driven execution
          │
          ├── Items
          │     messages / commands / tools / changes
          │
          └── Interactions
                things requiring a reply from host/user
```

With IDs:

```text
SessionId       durable conversation
TurnId          one execution within conversation
ItemId          one unit of agent work
InteractionId   one question/approval requiring response
```

And one layer lower:

```text
TransportRequestId
```

which belongs exclusively to the adapter.

---

## API shape

I'd probably end up around this:

```ts
interface AgentRuntime {
  createSession(options?: SessionOptions): Promise<AgentSession>;
  resumeSession(ref: SessionRef): Promise<AgentSession>;
}

interface AgentSession {
  id: SessionRef;

  startTurn(input: AgentInput): Promise<AgentTurn>;

  events(): AsyncIterable<SessionEvent>;

  close(): Promise<void>;
}

interface AgentTurn {
  id: string; // yours

  providerId?: string;

  events(): AsyncIterable<TurnEvent>;

  steer(input: AgentInput): Promise<void>;
  interrupt(): Promise<void>;
}

type TurnEvent =
  | { type: "item.started"; item: AgentItem }
  | { type: "item.delta"; itemId: string; delta: unknown }
  | { type: "item.completed"; item: AgentItem }
  | { type: "interaction.requested"; request: InteractionRequest }
  | { type: "turn.completed"; status: TurnStatus };
```

Then responding to agent interaction:

```ts
session.respond({
  interactionId: "...",
  response: ...
});
```

The adapters translate:

```text
respond(interactionId)

Claude adapter
  → return value from can_use_tool / AskUserQuestion handling

Codex adapter
  → JSON-RPC response using original request id
```

## Important architectural point

I'd make **your `TurnId` the primary correlation key**.

Do not require providers to supply one.

When you call:

```ts
const turn = await session.startTurn(...)
```

allocate:

```text
turn.id = your ULID/UUID
```

immediately.

The adapter then keeps:

```ts
{
  localTurnId: "01K...",
  providerTurnId: "turn_456" // Codex
}
```

or:

```ts
{
  localTurnId: "01K...",
  providerTurnId: undefined  // Claude
}
```

That solves the asymmetry cleanly.

One more subtlety: **`startTurn()` acknowledgment and `turn.completed` are separate concepts.** Codex makes this explicit: `turn/start` acknowledges with an initial turn object, then streams work until `turn/completed`.  [oai_citation:8‡OpenAI Developers](https://developers.openai.com/codex/app-server) Your abstraction should preserve that asynchronous model rather than making `startTurn()` wait for the full answer.

---

Mostly ok, but too much focus on interactive sessions - but I’m building a dark factory that could reuse agents (need session id) or spawn new ones (oneshots) and have a bit different objectives like observality, cost, tokens spend, elapsed time, result, artifacts

---

Yes. For this system I’d use **`AgentExecutor`** or **`AgentBackend`**, not `AgentRuntime`. Your abstraction is closer to a batch/work executor with optional continuity.

The core model should be:

```text
Job / Objective
   │
   ├── Run A ── fresh session ── Claude
   │
   ├── Run B ── resume session X ── Claude
   │
   └── Run C ── fresh session ── Codex
```

A **run is the unit you measure**. A session is merely state that can be carried between runs.

## Core interface

```ts
interface AgentExecutor {
  start(spec: RunSpec): Promise<RunHandle>;
}

interface RunSpec {
  objective: string;

  session:
    | { mode: "fresh" }
    | { mode: "resume"; ref: SessionRef };

  workspace: WorkspaceRef;

  limits?: {
    timeoutMs?: number;
    maxCostUsd?: number;
    maxTokens?: number;
  };
}

interface SessionRef {
  provider: "claude-code" | "codex";
  id: string;
}
```

Then:

```ts
interface RunHandle {
  runId: string;              // factory-generated

  events: AsyncIterable<RunEvent>;

  result(): Promise<RunResult>;

  cancel(): Promise<void>;
}
```

The `runId` is entirely yours. It exists even before Claude/Codex has created its session.

---

# `RunResult` becomes the important contract

Something approximately like:

```ts
interface RunResult {
  runId: string;

  status:
    | "succeeded"
    | "failed"
    | "timed_out"
    | "cancelled";

  // Continuity handle returned by provider.
  session?: SessionRef;

  result?: {
    text?: string;
    structured?: unknown;
  };

  usage: Usage;

  cost: Cost;

  timing: {
    startedAt: Date;
    finishedAt: Date;
    elapsedMs: number;
    providerActiveMs?: number;
  };

  artifacts: Artifact[];

  error?: AgentError;

  provider: {
    name: string;
    model?: string;
    raw?: unknown;
  };
}
```

That gives your factory exactly the things it cares about.

---

## Usage should tolerate provider asymmetry

I would avoid:

```ts
tokens: number
```

and instead use:

```ts
interface Usage {
  inputTokens?: number;
  outputTokens?: number;

  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;

  totalTokens?: number;

  source: "provider" | "derived";
}
```

Claude's Agent SDK `ResultMessage` already gives you `usage`, `total_cost_usd`, `duration_ms`, `duration_api_ms`, `num_turns`, and `session_id`. Anthropic explicitly describes these as per-run metrics.  [oai_citation:0‡Claude Platform](https://platform.claude.com/cookbook/claude-agent-sdk-04-migrating-from-openai-agents-sdk?utm_source=chatgpt.com)

OpenAI exposes token usage at turn/session level, including input, cached input, output and reasoning tokens; their docs explicitly warn that some usage can be best-effort or temporarily unavailable.  [oai_citation:1‡OpenAI Developers](https://developers.openai.com/api/docs/guides/agents-api/observability?utm_source=chatgpt.com)

So keep optional fields optional.

---

# Cost deserves provenance

Especially if you're comparing factories/providers:

```ts
interface Cost {
  usd?: number;

  source:
    | "provider"
    | "calculated"
    | "unknown";

  components?: {
    model?: number;
    tools?: number;
    compute?: number;
  };
}
```

Claude Code is particularly convenient because the final Agent SDK result supplies `total_cost_usd`.  [oai_citation:2‡Claude Platform](https://platform.claude.com/cookbook/claude-agent-sdk-04-migrating-from-openai-agents-sdk?utm_source=chatgpt.com)

For systems where you calculate cost from token usage, mark it as calculated. Don't silently mix calculated prices with provider-reported billing.

This will matter when pricing includes sandbox runtime, web searches, cache writes, etc.

---

# Timing should mostly be factory-owned

I would always measure:

```ts
const start = performance.now();

await executor...

elapsedMs = performance.now() - start;
```

That's your canonical wall-clock latency.

Then additionally preserve whatever the provider gives you:

```ts
timing: {
  elapsedMs: 42_381,       // factory
  providerActiveMs: 38_920 // provider, if available
}
```

Claude, for example, exposes both `duration_ms` and `duration_api_ms`.  [oai_citation:3‡Claude Platform](https://platform.claude.com/cookbook/claude-agent-sdk-07-hosting-the-agent?utm_source=chatgpt.com)

This lets you later answer questions such as:

```text
queue time
process startup
model/API time
tool execution
artifact collection
total wall time
```

without conflating them.

---

# Artifacts should belong to your factory, not the adapter

This is probably the biggest architectural distinction I'd make.

I wouldn't rely on Claude/Codex to tell you what the artifacts are.

If each agent operates inside a controlled worktree/container:

```text
Before run
   ↓
workspace snapshot
   ↓
Claude / Codex
   ↓
workspace snapshot
   ↓
ArtifactCollector
```

Then:

```ts
interface Artifact {
  kind:
    | "file"
    | "patch"
    | "log"
    | "test-report"
    | "structured-output";

  path?: string;
  digest?: string;
  mimeType?: string;
  size?: number;

  metadata?: Record<string, unknown>;
}
```

The provider adapter can **suggest** artifacts from its events, but the authoritative source for filesystem artifacts should be the environment/workspace layer.

OpenAI makes a similar conceptual separation in its current agent architecture: harness/session state is distinct from the environment where commands execute and files are modified.  [oai_citation:4‡OpenAI Developers](https://developers.openai.com/api/docs/guides/agents-api/architecture?utm_source=chatgpt.com)

---

# Streaming then becomes observability

You probably don't need a giant provider-neutral interactive protocol.

I'd normalize a small operational stream:

```ts
type RunEvent =
  | { type: "run.started" }
  | { type: "session.created"; session: SessionRef }

  | { type: "activity"; activity: Activity }
  | { type: "usage"; usage: Usage }
  | { type: "artifact"; artifact: Artifact }

  | { type: "run.completed"; result: RunResult }
  | { type: "run.failed"; error: AgentError };
```

Where activity is deliberately broad:

```ts
type Activity =
  | { kind: "message"; text: string }
  | { kind: "command"; command: string }
  | { kind: "tool"; name: string }
  | { kind: "file-change"; path: string }
  | { kind: "reasoning"; summary?: string }
  | { kind: "other"; data: unknown };
```

And always retain:

```ts
providerEvent?: unknown;
```

for debugging.

I wouldn't attempt to force every Claude and Codex event into an identical taxonomy. Normalize what your scheduler/observability stack actually consumes.

---

# Session reuse becomes a scheduling decision

This becomes quite simple.

### Fresh worker

```ts
executor.start({
  objective,
  session: { mode: "fresh" },
  workspace
});
```

Output:

```ts
{
  session: {
    provider: "claude-code",
    id: "..."
  }
}
```

Your scheduler may discard that reference after completion.

### Reused worker

Later:

```ts
executor.start({
  objective: "Now fix the remaining failing integration test",
  session: {
    mode: "resume",
    ref: previous.session
  },
  workspace
});
```

This is another **run**, with another `runId`, another cost/timing record, and another artifact set.

So:

```text
session S
    │
    ├── run 17   $0.21   34 sec
    ├── run 28   $0.13   19 sec
    └── run 41   $0.48   67 sec
```

This gives you useful factory analytics:

```text
cost/job
cost/run
cost/session
tokens/run
session reuse rate
success rate
time-to-result
artifact yield
retry cost
provider/model comparison
```

---

## I'd actually add `Job` above `Run`

Because retries will happen:

```text
Job J123
objective: fix issue #982

    attempt/run R1
       Claude
       failed
       $0.19

    attempt/run R2
       Codex
       succeeded
       $0.31
```

So your stable hierarchy becomes:

```text
Job
  └── Run / Attempt
        ├── Provider
        ├── SessionRef?
        ├── Workspace
        ├── Events
        ├── Usage
        ├── Cost
        ├── Timing
        ├── Result
        └── Artifacts
```

This is the boundary I'd build the dark factory around.

And it maps cleanly to the vendors: Anthropic itself exposes a result containing session ID + cost + usage + duration, while OpenAI's agent APIs explicitly separate sessions, turns, environments, event streams and usage accounting.  [oai_citation:5‡Claude Platform](https://platform.claude.com/cookbook/claude-agent-sdk-07-hosting-the-agent?utm_source=chatgpt.com)

The adapter then becomes fairly thin:

```text
ClaudeCodeExecutor
  claude stream-json
       ↓
  normalize events
       ↓
  RunResult

CodexExecutor
  codex app-server / exec --json
       ↓
  normalize events
       ↓
  RunResult
```

I think **`Job → Run → optional SessionRef`** is the key correction from the earlier session-centric design.
