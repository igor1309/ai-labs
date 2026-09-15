---
date: 2026-09-15
model: gpt-5.6-sol
description: "Exploratory Noreta implementation notes — a local-first Claude/Codex session viewer: session model, indexing, update model, and proposed stack"
---

# Noreta — Implementation Notes

Working implementation notes for a local-first Claude/Codex session
launcher. These are exploratory technical decisions and constraints, not
an ADR.

## Initial Scope

Start with macOS only.

The first client is a local web UI. iPhone/remote access can be added
later against the same server/API boundary.

High-level shape:

``` text
daemon / indexer
      ↓
   local DB
      ↓
HTTP + realtime API
      ↓
    web UI
```

## Session Model

A session should expose enough facts for the UI to choose its own
grouping, sorting, and filtering.

Useful attributes include:

-   agent: Claude or Codex
-   session identifier
-   associated runtime identifier, when active
-   runtime state
-   creation time
-   last message time
-   cwd / workspace path
-   whether the workspace currently exists
-   repository identity/root, when applicable
-   worktree identity/path, when applicable
-   branch, when available

Grouping is a UI projection rather than a persisted primary entity.
Possible views include repository, workspace/worktree, agent, or no
grouping.

## Active vs. Inactive

A session is active when a live runtime owns it and can continue it
directly without first resuming/recreating the runtime.

Useful active substates:

-   `working` --- executing a turn/tool
-   `waiting` --- waiting for user input or approval
-   `idle` --- runtime is alive but currently doing nothing

`inactive` means the persisted session can potentially be resumed, but
there is no live runtime currently owning it.

For inactive sessions, `lastMessageAt` is particularly important as a
relevance signal.

Filesystem modification time should not be the source of truth for
active state. It is useful as supporting activity metadata.

## Workspaces and Worktrees

Repository and worktree/workspace metadata should be retained with the
session.

Different worktrees of the same repository represent different working
contexts and should remain distinguishable.

Deleted worktrees remain meaningful historical context. When a worktree
disappears, keep its known identity/path/repository metadata and mark
the workspace as no longer present rather than collapsing its sessions
into the repository root.

It is useful to distinguish:

-   facts captured during the life of the session
-   current filesystem/git state

This preserves session identity after branches, directories, or
worktrees disappear.

## Index Depth and History

Separate indexing policy from UI visibility.

A reasonable default is:

-   index metadata for all discoverable sessions
-   eagerly process recent/relevant session content
-   process older content lazily or on demand

The default UI can show active sessions plus a recent time window, with
older sessions collapsed behind a control such as:

``` text
42 older sessions → Show
```

The exact cutoff (for example 7, 14, or 30 days) should remain a
UI/configuration choice rather than a destructive retention rule.

Old sessions should remain searchable and resumable where the underlying
agent supports it.

## Search

Search should be a first-class capability.

Likely searchable dimensions:

-   session
-   project/repository
-   workspace/worktree
-   branch
-   agent
-   message text

## Update Model

Use a hybrid event-driven model with periodic reconciliation.

### Filesystem watcher

Watch Claude/Codex session storage locations for relevant filesystem
events:

``` text
session created
session file changed
new messages appended
```

These events trigger incremental index updates and provide near-realtime
updates with little idle cost.

### Runtime observer

Filesystem events alone do not fully describe runtime state.

Maintain a lightweight observer for candidate live runtimes to determine
states such as:

``` text
working
waiting
idle
inactive
```

Where an agent exposes a structured runtime protocol/event stream,
prefer that over inference.

### Reconciliation

Periodically reconcile source state against the local database to
recover from missed events and detect changes such as:

-   terminated runtimes
-   removed worktrees
-   sessions created while the daemon was stopped
-   missed filesystem events

Run the same reconciliation during daemon startup.

Conceptually:

``` text
filesystem watcher → fast session/message updates
runtime observer   → live runtime state
reconciliation     → eventual correctness
```

## Realtime UI

The local server pushes relevant changes to the browser through SSE or
WebSocket.

The browser should not independently inspect agent files or processes;
the daemon owns discovery, indexing, and runtime state.

## Proposed Stack

Optimize initially for implementation speed and low complexity.

-   TypeScript end-to-end
-   Node.js
-   Fastify
-   SQLite
-   React
-   Vite
-   Tailwind
-   shadcn/ui
-   SSE or WebSocket for realtime updates

A single local process can serve both the API and built frontend assets.

Rust or Go can be reconsidered later if profiling shows a concrete
reason to move daemon/indexing components out of Node.js.

## Unified Launcher

The product should present Claude and Codex sessions through one session model and one launcher UI.

Agent-specific differences belong behind adapters. The primary UI should let the user discover, inspect, search, and open sessions without first choosing an agent-specific interface.

## Deeplinks

Deeplinks are a first-class navigation mechanism.

A session should have a stable launcher-level link that can open the relevant session/runtime directly. This is useful for:

- launcher navigation
- notifications
- links from other local tools
- future mobile handoff

Conceptually:

```text
launcher://session/<id>
```

The launcher can translate this into an agent-specific deeplink when appropriate, or open its own session view.

A future notification such as “Claude auth-refactor is waiting for input” should link directly to that session.

## Runtime Adapters

Keep agent-specific runtime integration behind adapters.

Conceptually:

```text
                ┌─ Claude adapter
session service ┤
                └─ Codex adapter
```

For Codex, prefer its structured app-server/runtime protocol where available.

For Claude, use the best available local runtime/session interfaces. Transcript/session files can provide persisted conversation state; runtime interaction may require a separate mechanism.

The shared model should normalize capabilities such as:

- discover session
- inspect transcript
- determine runtime state
- send input
- handle approval/input requests
- resume/open session

Capabilities can differ between agents without leaking those differences throughout the application.

## Attaching to Existing Runtimes

An important requirement is discovering and interacting with sessions that were started independently of the launcher.

The architecture should therefore avoid making a proprietary launcher wrapper the only way to create an attachable session.

Where direct structured attachment is available, use it. Where it is unavailable, PTY/tmux or another local transport can be considered as an internal compatibility mechanism.

This requirement should be validated separately for Claude and Codex because their runtime interfaces differ.

## Semantic UI, Not Terminal UI

Remote/mobile interaction should expose agent semantics rather than a terminal emulator.

The intended surface is closer to a messaging/client UI:

```text
transcript
tool calls
diffs
status
approval / reject
input field
```

A PTY or tmux layer may be useful internally, but it should remain an implementation detail rather than the primary user experience.

## Future Relay

The Mac remains the source of truth for runtimes, sessions, files, and execution.

A later remote architecture can look like:

```text
Claude / Codex runtimes
        ↓
local daemon
        ↓
authenticated relay / private network
        ↓
iPhone client
```

The remote client should operate on the same session model and API concepts as the local web UI.

This differs from vendor-account remote control: the target is the runtimes executing on the user's Mac, with the local daemon acting as the control boundary.

The initial Mac-only implementation should preserve this path without requiring the relay or iPhone client in the first version.

## Future Direction

The local server/API boundary should make a later iPhone client possible
without redesigning session discovery and indexing.

A future remote layer can expose selected local runtime operations while
keeping the Mac as the source of truth.
