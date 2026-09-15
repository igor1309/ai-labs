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
| `src/sessions.ts` | Session view: maps observed sessions to active/waiting state and orders them by last activity. `recentSessions` applies the default view's recency cutoff. Discovery sits behind the `SessionSource` port. |
| `src/follow.ts` | Follows one session: pushes a fresh state and transcript whenever the `SessionChanges` port signals, so an open session reflects new activity without being asked. |
| `src/search.ts` | Finds sessions by agent, repository, branch or message text, across the whole source rather than the default view. |
| `src/ordering.ts` | The one ordering rule: sort by a timestamp in either direction, treating an unreadable one as the oldest instead of returning `NaN`. |
| `src/transcript.ts` | Session transcript: messages, tool calls and file diffs, oldest first. Reading sits behind the `TranscriptSource` port. |
| `tests/active-sessions.test.ts` | One test per Gherkin scenario of the "See active sessions" feature in [docs/qa.md](docs/qa.md), named after it. |
| `tests/recent-sessions.test.ts` | Same, for "See recent sessions". |
| `tests/read-session.test.ts` | Same, for "Read a session". |
| `tests/follow-session.test.ts` | Same, for "Follow an active session". |
| `tests/find-session.test.ts` | Same, for "Find a session" — one test per Examples row. |
| `tests/qa-coverage.test.ts` | Asserts each implemented feature's test file declares exactly the scenario titles in [docs/qa.md](docs/qa.md). |
| `tests/follow-unknown-session.test.ts` | Not QA scenarios: following an unknown id, and how often following pushes. |
| `tests/change-signal.ts` | Test stand-in for the watcher behind `SessionChanges`. |
| `tests/transcript-entries.test.ts` | Entry-shape guarantees that are not QA scenarios: speakers stay distinguishable. |
| `tests/session-ordering.test.ts` | Ordering edge cases that are not QA scenarios: unreadable and tied timestamps, unknown sessions. |
| `tests/session-source.ts` | Test sources feeding `SessionSource`, plus the `stateOf` projection. |
| `tests/transcript-source.ts` | Test sources feeding `TranscriptSource`. |

What this does **not** yet do: neither `SessionSource` nor `TranscriptSource`
has a production implementation, so the only thing feeding them is a test
source. There is no adapter, no renderer and no entry point. Real Claude Code
and Codex adapters, startup reconciliation and termination detection are still
ahead; see [docs/implementation-notes.md](docs/implementation-notes.md).

### Pinned scenarios

Every QA scenario has a test, but some of those tests cannot fail against the
current code — they constrain whatever implements the missing piece rather than
checking behavior that exists. Kept honest here rather than buried in the log.

| Scenario | Why it cannot fail yet | What would drive it |
|----------|------------------------|---------------------|
| A session starts outside Noreta | The port is re-read per call and no code knows how a session was started | A real discovery adapter |
| Noreta starts after the agent | Same | A real discovery adapter |
| A transcript contains a tool call | Nothing renders a transcript; the test only proves tagged entries survive ordering | A renderer, tested at the presentation boundary |
| A transcript contains a file diff | Same | A renderer, tested at the presentation boundary |

Tests and typecheck, from the repo root:

```bash
node --import tsx --test noreta/tests/*.test.ts
npx tsc --noEmit -p noreta
```

## Stack

Only the parts above exist. The rest is proposed: TypeScript end-to-end —
Node.js, Fastify, SQLite, React, Vite, Tailwind, shadcn/ui, with SSE or
WebSocket for realtime updates. See
[docs/implementation-notes.md](docs/implementation-notes.md).
