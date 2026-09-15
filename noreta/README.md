---
date: 2026-09-15
model: claude-opus-5
description: "Noreta — local hub for coding-agent sessions across Claude Code, Codex and Pi; read-only macOS MVP, iPhone next, runtime interaction later"
---

# noreta

Local hub for coding-agent sessions.

## Description

One place to see active and past work across coding agents — Claude Code, Codex,
Pi, later OpenCode and others. Sessions can be searched, filtered and grouped,
and read together with their history and project context.

Read-only is a property of the first versions, not a definition of the product:
the MVP observes local sessions on a Mac, V2 brings the same read-only access to
iPhone, and later stages add interaction with local runtimes (reply, approvals,
resume, handoff, automation).

Working name. Implementation has started with the session-state projection
behind the "See active sessions" feature. Nothing reads a real Claude Code or
Codex session yet — there is no adapter and no entry point.

## Docs

| Doc | Purpose |
|-----|---------|
| [docs/product-vision.md](docs/product-vision.md) | Product vision and staging (MVP · Mac, V2 · iPhone, beyond) |
| [docs/name-brief.md](docs/name-brief.md) | Name rationale, availability snapshot, naming constraints |
| [docs/user-stories.md](docs/user-stories.md) | Top user stories for the read-only Mac MVP, as Gherkin scenarios |
| [docs/qa.md](docs/qa.md) | QA scenarios for the MVP, one Gherkin feature per user story |
| [docs/implementation-notes.md](docs/implementation-notes.md) | Exploratory technical notes — session model, indexing, update model, proposed stack |
| [docs/backlog.md](docs/backlog.md) | Deferred ideas |
| [docs/log.md](docs/log.md) | Project log |

## Implementation

| Path | Contents |
|------|----------|
| `src/sessions.ts` | Session view: `viewSessions` reads the `SessionSource` and orders by last activity; `recentSessions`, `olderSessions` and `activeSessions` are list-to-list projections over the result. `RuntimeState` carries a bare `waiting` beside the two kinds, for a source that knows a session is blocked but not on what. |
| `src/follow.ts` | Follows one session: pushes a fresh state and transcript whenever the `SessionChanges` port signals, so an open session reflects new activity without being asked. |
| `src/search.ts` | Finds sessions by agent, repository, branch or message text, across the whole source rather than the default view. Returns the matches together with the sessions whose transcript could not be read, so an unreadable one is reported rather than dropped. |
| `src/grouping.ts` | Partitions a session list by repository, workspace or agent. |
| `src/ordering.ts` | The one ordering rule: sort by a timestamp in either direction, treating an unreadable one as the oldest instead of returning `NaN`. |
| `src/transcript.ts` | Session transcript: messages, tool calls and file diffs, oldest first. Reading sits behind the `TranscriptSource` port. |
| `src/claude-code.ts` | Discovery adapter: reads the JSONL transcripts Claude Code leaves under `~/.claude/projects` and reports each as an `ObservedSession`. The project directory's name is the workspace path with its separators replaced, which is lossy, so workspace and branch come from the records. Runtime state comes from the `RuntimeStates` port, which it owns. |
| `src/claude-code-transcript.ts` | Implements `TranscriptSource`: reads a session's JSONL transcript, found by session id in whichever project directory holds it. Text blocks become messages, `tool_use` blocks tool calls, and an edit's `structuredPatch` a unified diff. |
| `src/session-lines.ts` | Plain-text lines for a session list: an active marker, agent, state, branch and workspace, and last activity. The state column reads `active`, `waiting` or `inactive` — `SessionView` carries no `working`/`idle` split to show. |
| `src/main.ts` | Composition root and entry point: the only module that reads the home directory and the clock. Wires both Claude Code adapters into the domain and prints the last 7 days of sessions. Its wiring has no test; the real run is the check. |
| `tests/active-sessions.test.ts` | One test per Gherkin scenario of the "See active sessions" feature in [docs/qa.md](docs/qa.md), named after it. |
| `tests/recent-sessions.test.ts` | Same, for "See recent sessions". |
| `tests/read-session.test.ts` | Same, for "Read a session". |
| `tests/follow-session.test.ts` | Same, for "Follow an active session". |
| `tests/find-session.test.ts` | Same, for "Find a session" — one test per Examples row, plus the scenarios outside the outline. |
| `tests/organize-sessions.test.ts` | Same, for "Organize sessions". |
| `tests/access-older-sessions.test.ts` | Same, for "Access older sessions". |
| `tests/search-sources.test.ts` | Not QA scenarios: what search asks of the transcript source, and the empty query. |
| `tests/qa-coverage.test.ts` | Asserts each implemented feature's test file declares exactly the scenario titles in [docs/qa.md](docs/qa.md). |
| `tests/follow-unknown-session.test.ts` | Not QA scenarios: following an unknown id, and how often following pushes. |
| `tests/change-signal.ts` | Test stand-in for the watcher behind `SessionChanges`. |
| `tests/transcript-entries.test.ts` | Entry-shape guarantees that are not QA scenarios: speakers stay distinguishable. |
| `tests/recent-and-older.test.ts` | Not a QA scenario: the recent/older split loses no session. |
| `tests/grouping-at-scale.test.ts` | Not a QA scenario: grouping a long history stays linear. |
| `tests/session-ordering.test.ts` | Ordering edge cases that are not QA scenarios: unreadable and tied timestamps, unknown sessions. |
| `tests/claude-code-sessions.test.ts` | Not QA scenarios: what the Claude Code adapter makes of the files on disk — the record it believes, a half-written last line, a workspace that is gone, a transcript that never says where it is working, and a long transcript whose context is at either end. |
| `tests/claude-code-projects.ts` | Writes a throwaway `~/.claude/projects` tree for those tests. |
| `src/claude-code-registry.ts` | Implements `RuntimeStates` from `~/.claude/sessions/<pid>.json`, the registry Claude Code keeps of its running sessions. The file name is the claim that the session runs, so a registration whose process is gone is dropped rather than believed. Two live processes can register one session; the busiest of them is reported. |
| `tests/claude-code-runtime.test.ts` | Not QA scenarios: the status mapping, and a registration that outlived its process. |
| `tests/claude-code-registry.ts` | Writes a throwaway registry directory for those tests. |
| `tests/session-state.test.ts` | Not a QA scenario: a session waiting without a known kind still reads as waiting. |
| `tests/session-lines.test.ts` | Not QA scenarios: how a session list reads as plain text. |
| `tests/claude-code-transcript.test.ts` | Not QA scenarios: what the transcript adapter makes of Claude Code's records. |
| `tests/session-source.ts` | Test sources feeding `SessionSource`, plus the `stateOf` projection. |
| `tests/transcript-source.ts` | Test sources feeding `TranscriptSource`. |

What this does **not** yet do: both ports have a Claude Code implementation
and nothing else. The transcript adapter skips what Claude Code marks `isMeta`, but still
reports unmarked wrappers such as `<task-notification>` as user messages, and
a newly created file as an empty diff.
`npm start` prints recent sessions as plain text; the
presentation target beyond that is undecided. A Codex
adapter and startup reconciliation are still ahead; see
[docs/implementation-notes.md](docs/implementation-notes.md).

Two QA scenarios are out of this adapter's reach rather than merely unbuilt.
Claude Code's registry records a free-text `waitingFor` whose commonest value,
`"dialog open"`, covers a permission prompt and a plain question alike, so
nothing on disk separates waiting for input from waiting for approval. A
session blocked either way reports the bare `waiting`, and "A session waiting
for input is visible as waiting" and "A session waiting for approval is visible
as waiting" are distinguishable only through a source that says which.

Discovery reads only the last 64 KB of each transcript, where the newest
context record sits, and falls back to the whole file only when that tail holds
none. Against a real `~/.claude/projects` of 1546 sessions it takes about 200 ms,
with output identical to a whole-file read.

### Pinned scenarios

Every QA scenario has a test, but some of those tests cannot fail against the
current code — they constrain whatever implements the missing piece rather than
checking behavior that exists. Kept honest here rather than buried in the log.
Each entry was confirmed by breaking the implementation and watching the test
stay green.

| Scenario | Why it cannot fail yet | What would drive it |
|----------|------------------------|---------------------|
| A session starts outside Noreta | The port is re-read per call and no code knows how a session was started | These scenarios running against `claudeCodeSessions` rather than a test source — the adapter exists now, their tests do not use it |
| Noreta starts after the agent | Same | Same |
| A transcript contains a tool call | The test runs against a test source, so it only proves tagged entries survive ordering | The scenario running against `claudeCodeTranscript`, which does map tool calls, rather than a test source |
| A transcript contains a file diff | Same | The scenario running against `claudeCodeTranscript`, which does map edits to diffs, rather than a test source |
| Its worktree has been deleted | Half of it is real: the view cannot drop the worktree path or fold it into the repository root without failing. Nothing *notices* a worktree disappearing, though — the test hands the view a session already marked gone | The scenario running against `claudeCodeSessions`, which does check the workspace, rather than a test source |
| Open a session from a deleted worktree | `readTranscript` never consults a workspace, so no implementation of it could fail this | The scenario running against `claudeCodeTranscript`, which finds a transcript by session id and never consults the workspace, rather than a test source |

Tests and typecheck, from the repo root:

```bash
node --import tsx --test noreta/tests/*.test.ts
npx tsc --noEmit -p noreta
```

Run against this machine's Claude Code sessions, from the repo root:

```bash
npm --prefix noreta start
```

## Stack

Only the parts above exist. The rest is proposed: TypeScript end-to-end —
Node.js, Fastify, SQLite, React, Vite, Tailwind, shadcn/ui, with SSE or
WebSocket for realtime updates. See
[docs/implementation-notes.md](docs/implementation-notes.md).
