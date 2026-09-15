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
| `src/sessions.ts` | Session view: maps observed sessions to active/waiting state and orders them by last activity. Discovery sits behind the `SessionSource` port. |
| `tests/active-sessions.test.ts` | One test per Gherkin scenario of the "See active sessions" feature in [docs/qa.md](docs/qa.md), named after it. |
| `tests/recent-sessions.test.ts` | Same, for "See recent sessions". |
| `tests/session-source.ts` | Test sources feeding `SessionSource`. |

What this does **not** yet do: `SessionSource` has no production implementation,
so the only thing that feeds `viewSessions` is a test source. The scenarios
under "Sessions are discovered independently of how they were started" are
therefore pinned rather than driven — they constrain the adapters when those
arrive, and cannot fail today. Real Claude Code and Codex adapters, startup
reconciliation, and termination detection are the next slice; see
[docs/implementation-notes.md](docs/implementation-notes.md).

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
