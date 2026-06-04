---
name: handoff
description: >
  Use when writing or updating a session-handoff doc — a "read this first to
  resume" orientation for a fresh agent or session picking up ongoing work.
  Triggers: "write a handoff", "handoff doc", "hand off this work", "doc to
  resume next session", "HANDOFF.md". Produces a lean, pointer-based orientation,
  NOT a status dashboard — it keeps mutable state that drifts (versions, counts,
  "what's done") and forward tasks (those belong in a TODO) out of the handoff.
author: Igor Malyarov
version: "0.1.0"
---

# Handoff

A handoff is a **read-once orientation for a new session** resuming ongoing work —
it gets a fresh agent productive fast. It is **not** a living status dashboard, a
changelog, or a task list. The discipline below exists because handoffs rot: left
unchecked they fill with session-state that must be maintained on every change and
drifts out of sync with reality, so updating it becomes busywork and reading it
misleads.

## The one rule: point, don't copy

A handoff **points to where truth already lives**; it never copies content another
artifact owns. Every copy is a drift source — it goes stale the moment the source
changes, and now two places must be kept in sync.

- **Derivable beats snapshotted.** If `git`, a command, the code, or the tests
  answer it, give the *command or the path* — not a transcribed answer that rots.
- **Single source of truth.** Forward tasks live in the TODO — link it, don't
  re-list. What happened lives in the log / git history — don't narrate it.
  Rationale lives in ADRs / specs / design docs — link them.

```
Bad  (drifts):  "Branch is 35 commits ahead; skill at v0.11.1; 7 of 7 passes done,
                 validated across 3 runs."
Good (stable):  "Work is on `traceability` (unpushed). State: `git log`, the SKILL
                 version field, and `TODO.md`."
```

If a line needs updating every time you touch the project, it is holding the wrong
content — move it to its source or delete it.

## Keep (what a handoff is for)

- **Orientation** — one or two lines: what this work is, and where to start.
- **Pointers to the durable sources** — where the method, the tasks, the rationale,
  and the worked examples live (paths, not summaries).
- **Non-obvious gotchas** — what a fresh session would otherwise hit: fragile
  sequences, environment hazards, counterintuitive decisions, "we tried X, it
  fails because Y." Only what is *not* already written down elsewhere.
- **How to resume** — the entry point: the command to run, the first file to read,
  the in-flight thing to finish (link the TODO item; don't restate it).

## Drop (what a handoff is not)

- **Mutable state / status dashboard** — current version, commit-ahead count,
  "implemented" lists, "validated across N runs." All derivable, all drift.
- **A task backlog** — that is the TODO; the handoff links to it.
- **A changelog / accomplishment narrative** — that is the log and git history.
- **Anything you'd have to maintain to keep it true** — that maintenance burden is
  the signal the content belongs in its source, not here.

## Smell test

Read each line and ask: *will this still be true after the next three commits, and
is it owned by another doc?* If it will go stale → make it a pointer or a command.
If another doc owns it → link that doc. What survives is the handoff.
