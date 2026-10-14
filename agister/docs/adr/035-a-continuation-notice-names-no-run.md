# ADR-035: A continuation notice names no run

- **Status:** Accepted
- **Date:** 2026-10-12
- **Scope:** what a continued call's prompt says about the work it
  continues
- **Decision type:** Architecture
- **Amends:** [ADR-025](025-a-call-works-where-it-is-called.md) rule 7
  (the prompt says which run it continues)
- **Source:** LAB-200; the owner's decision, 2026-10-12

## Context

A continued call is told where it works and that the session's changes
are already there. It is also told the run it continues and the
session's latest run, by their IDs. The agent can do nothing with them:
it cannot read a run, and its session already holds the earlier turns.
The IDs show the machinery around the agent instead, runs that Agister
records and a caller continues. An agent that knows the process it is
part of starts to reason about it, which is the boundary the prompts keep
(LAB-200).

The record already names the run a call continues (ADR-025 rule 7, the
request's `continue`), so the prompt need not carry it for anyone else.

## Decision

### 1. The notice says what the agent works on

A continued call's prompt says that it continues the session's earlier
work, the worktree it works in and its revision, and that the session's
changes are already in this worktree, uncommitted. It names no run.

### 2. The record keeps the runs

A continued run's record names the run it continues and the session it
resumes, as before. ADR-025 rule 7's choice of the latest run, its
refusals and its content check are unchanged.

## Consequences

- An agent continued in a worktree reads the same notice whichever run
  it continues.
- Reading which run a call continued takes its record, not its prompt.

## Alternatives considered

- **Keep the run IDs:** rejected; they are evidence of nothing the agent
  can check, and they name the machinery around it.
