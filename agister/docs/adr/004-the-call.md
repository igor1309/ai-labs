---
date: 2026-10-14
model: claude-opus-5-5
description: "ADR-004: the call: it works in the caller's worktree, is admitted against the worktree, holds it as a reader or a writer, a continuation resumes there, and a turn at capacity is retried"
---

# ADR-004: The call

- **Status:** Accepted
- **Topic:** Running work
- **Date:** 2026-10-14
- **Scope:** where a call works, what admits it, the hold on its
  worktree, what it leaves, how a continuation resumes, who declares
  its limits, and a turn at capacity retried
- **Decision type:** Architecture
- **Amended by:** ADR-011 (2026-10-15), ADR-012 (2026-10-15), ADR-014
  (2026-10-20)

## Context

A caller hands Agister parts of its own task: implement, review, verify.
That work belongs where the task's work lives, in the caller's worktree
with its environment already prepared. Making and preparing worktrees is
the caller's: it makes one per change and runs Agister there. Calls in
one worktree must not trample each other, and a caller must be able to
go on with a session where it stopped.

## Decision

A call is the execution of a step, a process on an agent, whatever the
agent's runtime. A call works in the caller's worktree; Agister makes no worktree, checkout
or copy, and moves, resets or cleans nothing in it. `core/admit` admits
a call against facts about the worktree and holds it, readers together
and a writer alone. The facts come through ports core declares; the
composition answers them from `git`.

## Rules

### 1. A call works where it is called

A call works in the root of the git worktree that holds the launch
directory. The caller prepares it; Agister runs no setup.

### 2. A call may pin a revision and ask for a clean worktree

A call's process may name an input that resolves to a
revision: the call is admitted only if the worktree's HEAD is that
revision. It may ask for a clean worktree: the call is admitted only if the worktree's content
is its HEAD's. Agister does not move HEAD or clean anything; the caller
does.

### 3. Readers share the worktree, a writer has it alone

A call is a writer when its process declares read-write access;
otherwise it is a reader. For the whole call a writer holds the worktree
alone and readers hold it together. A call that cannot take its hold is
refused, not queued. A hold is on one worktree, by its root. Each call
of a run takes its own hold; nothing holds the worktree between them.

### 4. The call's changes stay in the worktree

Every call records, at its end, the worktree's content. A call that
pinned its revision also records its changes from that revision as a
patch. The changes are already in the worktree; nobody applies the
patch. Whatever the end, Agister leaves the worktree as the call left it,
for the caller to keep or discard.

### 5. A continuation resumes in the same worktree

A continuation resumes the provider session of the session's latest
call, in place. The composition admits it only if that call worked in the
same worktree, repository and revision, and the worktree's content is
what that call recorded at its end. These conditions take the place of a request
for a clean worktree. The agent is told that it continues its earlier
work and that its changes are in this worktree; it is told no run. The
record names the call continued. Inside a run, a binding continues an
earlier call's session, under the same conditions.

### 6. Cooperation, not confinement

Agister checks the worktree before a call and records it after. It does
not confine the agent to it (ADR-001, invariant 10), and the caller does
not change the worktree while a writer works in it.

### 7. The process declares a call's limits

A call's process declares its limits on time and cost, and an enclosing
run's budgets cover all its descendants. A cost budget limits reported
cost: a call whose runtime reports no cost spends none of it. A caller
may tighten the limits, never loosen them.

### 8. A turn failed on capacity is retried

A runtime's model at capacity is transient: the wrapper, which alone
knows the provider's words, classes it `capacity`, and core retries it,
one policy for every runtime, on by default: up to three turns at
capacity, a wait between them, within the call's limits
(`docs/run-implementation.md`, "Capacity"). A turn that reported its
session resumes it, keeping the work done; else the turn runs again. Each failed turn is recorded. In a workflow, the call
that failed is retried alone. No other agent takes over: a fallback the
settings declare waits (`backlog/run-path.md`; the owner's decisions on
LAB-249, 2026-10-13).

## Consequences

- A call sees the caller's environment as it is: its bindings, its build
  output, its ignored files.
- Keeping work apart is the caller's: a worktree per change.
- Core knows no git: the revision, the content, the patch and the
  worktree's root are answers to its ports.
