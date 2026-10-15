---
date: 2026-10-14
model: claude-opus-5-5
description: "ADR-005: verification and repair: a process declares one check, run after a valid turn; a failure goes back into the same session while attempts last"
---

# ADR-005: Verification and repair

- **Status:** Superseded by ADR-011
- **Date:** 2026-10-14
- **Scope:** the verification a process declares, when it runs, how a
  failure is repaired, the limits on that loop, and what it records
- **Decision type:** Architecture

## Context

A process may want a check run on what its call leaves, such as the
repository's tests, with a failure handed back to the agent to fix.

## Decision

A process may declare one verification. After the agent's turn, the
verification runs in the call's worktree. A failure, while attempts
last, goes back into the same session to fix, and the verification runs
again.

## Rules

### 1. A verification is declared, never chosen by the agent

A verification is a command, a timeout per run, a limit on time without
output, a number of attempts, and the instruction the agent is given when
a run fails. A process declares it inline or names a verification
document. A process meant for every repository names one each repository
supplies. The agent cannot choose, change or skip it.

### 2. It runs on a known start

A process that declares a verification pins its revision and asks for a
clean worktree (ADR-004, rule 2), so a run proves the call's changes from
known content.

### 3. It runs only after a valid turn

A verification runs after a turn whose output is valid against its
contract. A turn that fails, is interrupted or returns invalid output ends
the call with its own status; no verification runs.

### 4. A repair continues the call's own session

A failed run, with attempts left, is given back to the agent in the
call's own session, in the same worktree: the instruction, the command,
how it ended and its bounded output. The call has one session; a fresh
attempt is a caller's step, not a repair.

### 5. Limits cover the whole loop

Each run has its timeout, and the call's limits on time and cost cover
every turn and every run. Verification attempts are a limit of their own.
A run that gives no output for its limit is ended and is a failed
attempt.

### 6. How a verification ends a call

A call with a verification completes only when its latest run passes.
One that runs out of attempts, or repeats a failure, fails with its
budget exhausted. Usage and cost cover every turn; timing covers the
whole loop.

### 7. Every attempt is recorded

Each run is recorded with its turn: the command, how it ended, and its
bounded output with the digest of the whole.

### 8. The command runs with the caller's authority

The command is the caller's infrastructure, not an agent permission, and
what it runs can be code the agent wrote. Agister does not confine it
(ADR-001, invariant 10).

## Consequences

- A repository states its check once, and every process that uses it
  gets it.
- Fixing a failing test needs no retry node and no workflow.
