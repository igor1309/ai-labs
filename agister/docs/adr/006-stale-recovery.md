---
date: 2026-10-14
model: claude-opus-5-5
description: "ADR-006: stale recovery: a turn that stopped moving is ended, and may be resumed once with what went stale"
---

# ADR-006: Stale recovery

- **Status:** Accepted
- **Date:** 2026-10-14
- **Scope:** the staleness limits on a turn, what ends a stale turn, and
  the recovery turn that may follow it
- **Decision type:** Architecture

## Context

A turn can stop moving before its timeout: the agent repeats one tool
call, a command it ran hangs, or the runtime goes quiet. Ending the call
there loses the work; a message saying what went stale may let the agent
go on.

## Decision

A process may set staleness limits on a turn. `core/watch` reports a
limit reached; `core/session` ends the turn and, while the call's budget
of resumes lasts, resumes the session with a message that says what went
stale. The same thing going stale twice ends the call.

## Rules

### 1. Three limits on a turn

A turn is stale when it makes the same tool call a number of times in a
row, when one command it ran runs too long, or when the runtime reports
no event for too long. A process sets each limit; none is set by
default.

### 2. A stale turn is ended

`core/watch` observes the turn's events and reports the limit reached and
what went stale. `core/session` ends the turn, with its processes, and
the work the turn did stays in the worktree. When no recovery turn
follows, the call ends with the limit's status: a repeated call fails
with its budget exhausted; a hung command or a quiet runtime is
interrupted by timeout.

### 3. A recovery turn resumes the session

A process may give a call a budget of resumes, none by default, and the
instruction the agent is told. A stale turn, with a resume left and time
and cost left, is followed by a recovery turn in the call's own session:
the instruction, then what went stale. A recovery turn that ends well is
the call's latest turn, and what follows any turn follows it.

### 4. The same thing is never sent twice

A limit reached again on the same thing ends the call, as in rule 2:
sending it again would tell the agent nothing new.

### 5. The result shape does not change

A recovery turn has no status or class of its own, and spends no
verification attempt. The record holds each stale turn, what went stale,
and the recovery turn that followed.

## Consequences

- A stuck turn costs a message, not the call, where a message can help.
- A process that sets no budget runs as if recovery did not exist.
