# ADR-005: Verify runs on a clean copy of what is delivered

- **Status:** Accepted
- **Date:** 2026-09-30
- **Scope:** where a verification command runs
- **Decision type:** Architecture
- **Amends:** [ADR-002](002-verify-and-bounded-repair.md): where the command
  runs (Decision, rules 2 and 7)

## Context

A call delivers a patch from its base, and the patch leaves out ignored
files. ADR-002 runs the command in the call's own checkout, so a pass can
rest on an ignored file the agent created that the patch does not carry
(LAB-15). Detecting such files cannot tell a build leftover from a file the
check needs.

## Decision

### 1. The command runs on a clean copy of the base plus the patch

Each attempt applies its full patch from the base to a fresh copy and runs
the command there. The copy's content must be the attempt's content, or the
call fails. A run that changes the copy's content fails. The agent keeps
working, and repairs, in its own checkout.

### 2. One copy per call, owned before it exists

A call has one copy, at a path recorded on the run before the copy is
created. The copy is removed after every attempt. If a removal fails, the
next attempt cannot make its copy, and the call fails. A copy left on
record, by a failed removal or a killed CLI, is removed by the reap,
whether the run finished or not.

## Consequences

- A pass proves the delivered patch, not the checkout.
- Every attempt pays for a fresh copy, and starts with no ignored build
  output: a check must build from what is delivered.
