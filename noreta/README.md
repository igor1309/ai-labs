---
date: 2026-09-15
model: claude-opus-5
description: "Noreta — local hub for coding-agent sessions across Claude Code, Codex and Pi; read-only macOS MVP, iPhone next, runtime interaction later"
---

# noreta

Local hub for coding-agent sessions. Working name.

## Description

One place to see active and past work across coding agents — Claude Code, Codex,
Pi, later OpenCode and others. Sessions can be searched, filtered and grouped,
and read together with their history and project context.

Read-only is a property of the first versions, not a definition of the product:
the MVP observes local sessions on a Mac, V2 brings the same read-only access to
iPhone, and later stages add interaction with local runtimes (reply, approvals,
resume, handoff, automation).

## Run

From the repo root. List this machine's recent Claude Code sessions:

```bash
npm --prefix noreta start
```

Tests and typecheck:

```bash
node --import tsx --test noreta/tests/*.test.ts
npx tsc --noEmit -p noreta
```

## Docs

| Doc | Purpose |
|-----|---------|
| [docs/product-vision.md](docs/product-vision.md) | Product vision and staging (MVP · Mac, V2 · iPhone, beyond) |
| [docs/name-brief.md](docs/name-brief.md) | Name rationale, availability snapshot, naming constraints |
| [docs/user-stories.md](docs/user-stories.md) | Top user stories for the read-only Mac MVP, as Gherkin scenarios |
| [docs/qa.md](docs/qa.md) | QA scenarios for the MVP, one Gherkin feature per user story |
| [docs/implementation-notes.md](docs/implementation-notes.md) | Exploratory technical notes — session model, indexing, update model, proposed stack |
| [docs/TODO.md](docs/TODO.md) | Forward work and open questions |
| [docs/backlog.md](docs/backlog.md) | Deferred ideas |
| [docs/log.md](docs/log.md) | Project log |

## Implementation

| Path | Contents |
|------|----------|
| `src/sessions.ts` | Session view: `viewSessions` reads the `SessionSource` and orders by last activity; `recentSessions`, `olderSessions` and `activeSessions` are list-to-list projections over the result. A view carries the `RuntimeState` its source reported, and `isActive` and `isWaiting` read it. `RuntimeState` has a bare `waiting` beside the two kinds, for a source that knows a session is blocked but not on what. |
| `src/follow.ts` | Follows one session: pushes a fresh state and transcript whenever the `SessionChanges` port signals. |
| `src/search.ts` | Finds sessions by agent, repository, branch or message text across the whole source. Returns the matches together with the sessions whose transcript could not be read. |
| `src/grouping.ts` | Partitions a session list by repository, workspace or agent. |
| `src/ordering.ts` | The one ordering rule: sort by a timestamp in either direction, an unreadable one sorting oldest. |
| `src/transcript.ts` | Session transcript: messages, tool calls and file diffs, oldest first, read through the `TranscriptSource` port. |
| `src/claude-code.ts` | Implements `SessionSource` from the JSONL transcripts under `~/.claude/projects`. Workspace and branch come from the records, since the project directory's name is lossy; only the last 64 KB of each transcript is read, the whole file only when that tail holds no context record. Runtime state comes from the `RuntimeStates` port, which it owns. |
| `src/claude-code-registry.ts` | Implements `RuntimeStates` from `~/.claude/sessions/<pid>.json`. A registration whose process is gone is dropped; of two live processes registering one session, the busiest is reported. |
| `src/claude-code-transcript.ts` | Implements `TranscriptSource`: finds a session's JSONL transcript by id. Text blocks become messages, `tool_use` blocks tool calls, an edit's `structuredPatch` a unified diff, and a created file every line added; records Claude Code marks `isMeta` are skipped. |
| `src/session-lines.ts` | Plain-text lines for a session list: active marker, agent, state (`working`, `idle`, `waiting` or `inactive`), branch, workspace and last activity. |
| `src/main.ts` | Composition root and entry point: the only module that reads the home directory and the clock. Prints the last 7 days of Claude Code sessions. |
| `tests/active-sessions.test.ts` | One test per Gherkin scenario of "See active sessions" in [docs/qa.md](docs/qa.md), named after it. |
| `tests/recent-sessions.test.ts` | Same, for "See recent sessions". |
| `tests/read-session.test.ts` | Same, for "Read a session". |
| `tests/follow-session.test.ts` | Same, for "Follow an active session". |
| `tests/find-session.test.ts` | Same, for "Find a session" — one test per Examples row, plus the scenarios outside the outline. |
| `tests/organize-sessions.test.ts` | Same, for "Organize sessions". |
| `tests/access-older-sessions.test.ts` | Same, for "Access older sessions". |
| `tests/qa-coverage.test.ts` | Asserts each feature's test file declares exactly the scenario titles in [docs/qa.md](docs/qa.md), and that every feature there has a file. |
| `tests/claude-code-sessions.test.ts` | What the discovery adapter makes of the files on disk. |
| `tests/claude-code-runtime.test.ts` | The registry status mapping, and a registration that outlived its process. |
| `tests/claude-code-transcript.test.ts` | What the transcript adapter makes of Claude Code's records. |
| `tests/session-lines.test.ts` | How a session list reads as plain text. |
| `tests/session-state.test.ts` | A bare `waiting`, and the reported state carried onto the view. |
| `tests/search-sources.test.ts` | What search asks of the transcript source, and the empty query. |
| `tests/follow-unknown-session.test.ts` | Following an unknown id, and how often following pushes. |
| `tests/transcript-entries.test.ts` | Speakers stay distinguishable. |
| `tests/recent-and-older.test.ts` | The recent/older split loses no session. |
| `tests/grouping-at-scale.test.ts` | Grouping a long history stays linear. |
| `tests/session-ordering.test.ts` | Unreadable and tied timestamps, unknown sessions. |
| `tests/session-source.ts` | Test sources feeding `SessionSource`, plus the `stateOf` projection. |
| `tests/transcript-source.ts` | Test sources feeding `TranscriptSource`. |
| `tests/time.ts` | Builds timestamps on one fixed day from a clock time. |
| `tests/change-signal.ts` | Test stand-in for the watcher behind `SessionChanges`. |
| `tests/claude-code-projects.ts` | Writes a throwaway `~/.claude/projects` tree. |
| `tests/claude-code-registry.ts` | Writes a throwaway registry directory. |

## Stack

TypeScript on Node.js. Proposed beyond that: Fastify, SQLite, React, Vite,
Tailwind, shadcn/ui, with SSE or WebSocket for realtime updates — see
[docs/implementation-notes.md](docs/implementation-notes.md).
