---
date: 2026-10-14
model: claude-opus-5-5
description: "ADR-005: verification and repair: a process declares one check, run after a valid turn; a failure goes back into the same session while attempts last"
---

# ADR-005: Verification and repair

- **Status:** Proposed
- **Date:** 2026-10-14
- **Scope:** the verification a process declares, when it runs, how a
  failure is repaired, the limits on that loop, and what it records
- **Decision type:** Architecture

## Context

An agent's claim that its work is done is not evidence. A declared check
has to pass first, on the content the call leaves. When it fails, the
agent that did the work is the one to fix it, in the conversation it is
in, a few times at most. The check is the repository's (its formatter,
its tests); the process that uses it is not.

## Decision

A process may declare one verification. After a turn whose output is
valid, `core/attempts` runs it through `core/verify` in the call's
worktree. If it fails and attempts are left, `core/attempts` asks the
session for a repair turn with the failure, and runs it again. The call
completes only when the latest run passes on content it did not change.

## Rules

### 1. A verification is declared, never chosen by the agent

A verification is a command, a timeout per run, a number of attempts, and
the instruction the agent is given when a run fails. A process declares
it inline or names a verification document. A process meant for every
repository names one each repository supplies. The agent cannot choose,
change or skip it.

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
A run that gives no output for its staleness limit is ended and is a
failed attempt.

### 6. No rerun without progress

A run never repeats on content already checked, and the same failure
twice ends the loop. The call then fails as its budget exhausted.

### 7. A pass counts only on unchanged content

A run that changes the worktree's content fails, whatever its exit
status. A passing run leaves the content it checked.

### 8. The result shape does not change

Completed means valid output and a passing latest run. A last attempt
that failed, or no progress, is failed with its budget exhausted. Usage
and cost cover every turn; timing covers the whole loop.

### 9. Every attempt is recorded

Each run is recorded with its turn: the command, how it ended, its bounded
output with the digest of the whole, the content it checked, and the
changes the turn before it made.

### 10. The command runs with the caller's authority

The command is the caller's infrastructure, not an agent permission, and
what it runs can be code the agent wrote. Agister does not confine it
(ADR-001, invariant 10).

## Consequences

- A repository states its check once, and every process that uses it
  gets it.
- Fixing a failing test needs no retry node and no workflow.
- `core/attempts` knows no git: the worktree's content is an answer to a
  port the composition answers from `git`.

## Open

- **Who checks that a repair can resume.** A verification with more than
  one attempt needs a session that resumes; where that is checked is
  ADR-003's open point.
