---
title: "ADR: ReviewFixPolicy Seam"
date: 2026-04-25
model: opus-4.7
description: "Orchestrator delegates post-review routing to an injected ReviewFixPolicy protocol and does not adjudicate."
status: accepted
product: Reinix
scope: orchestration
---

# ADR: ReviewFixPolicy Seam

## Executive Summary

Reinix's Orchestrator delegates every post-review routing decision to an injected `ReviewFixPolicy` protocol. The Orchestrator does not adjudicate verdicts; it sequences agent calls, threads an opaque policy session across rounds, and acts on the policy's decision.

This locks in the seam: routing logic is replaceable without touching the Orchestrator.

Scope: existence and shape of the seam — protocol ownership, the Orchestrator's non-adjudication invariant, and session threading. Out of scope: concrete decision values, session schema, budget mechanics, threshold tuning, and any specific policy implementation.

## Status

Accepted

## Context

Reinix's flow loops through Producer → Reviewer → routing decision → optional Remediator → Producer again. The routing decision after each review is the only place where workflow termination, continuation, and convergence logic lives.

Two places this logic could live:

- **Inside the Orchestrator.** Simpler to wire, but couples routing thresholds, budget shape, and convergence heuristics to the loop runner. Every adjustment to policy requires touching orchestration code, and multiple policies cannot coexist without conditionals in the runner.
- **In an injected protocol.** Orchestrator stays a pure sequencer; routing evolves independently; multiple policies coexist by injection.

The orchestration draft (`reinix/docs/reinix-orchestration.md`) commits to the second shape but is explicitly a non-normative draft. The seam needs ADR-level capture so a future contributor cannot legitimately collapse routing back into the Orchestrator.

## Decision

Routing decisions after review MUST be delegated to an injected `ReviewFixPolicy` protocol.

The Orchestrator MUST NOT adjudicate verdicts.

The Orchestrator MUST consult `ReviewFixPolicy` for every routing decision, passing the current verdict and the current policy session, and MUST act only on the policy's returned decision.

The policy session is opaque to the Orchestrator. The Orchestrator threads the session across rounds but MUST NOT inspect, mutate, or persist its contents.

`ReviewFixPolicy` is a protocol owned by its client (the Orchestrator) and lives in the same module as the Orchestrator.

## Rules / Invariants

- The Orchestrator MUST hold exactly one `ReviewFixPolicy` instance for the duration of a run, supplied by composition at construction time.
- A run MUST NOT start without a `ReviewFixPolicy` instance.
- The Orchestrator MUST call `ReviewFixPolicy` exactly once per completed review, before any subsequent agent call.
- The Orchestrator MUST forward the policy's returned session unchanged to the next policy call within the same run.
- The Orchestrator MUST NOT contain conditional logic over verdict severity, finding categories, recurrence, or budget state. Such logic belongs to the policy.
- The Orchestrator MUST NOT short-circuit a policy decision based on its own inspection of the verdict.
- The `ReviewFixPolicy` protocol definition MUST live in the Orchestrator's module.

## Consequences

### Positive

- Routing policies evolve independently of the Orchestrator.
- Multiple policies can coexist (e.g., per-task-class) by injection alone.
- The Orchestrator's responsibility shrinks to sequencing and stop-on-failure, making it easier to reason about and test.
- Policy logic is testable in isolation against synthetic verdicts and sessions.
- Cross-round reasoning (no-progress detection, convergence) becomes a pure policy concern, hidden behind the opaque session.

### Negative

- The Orchestrator cannot start without a policy injected. Composition root must always supply one.
- Changes to the policy protocol surface ripple through every implementation and every Orchestrator caller.
- An opaque session means the Orchestrator cannot offer cross-cutting diagnostics about routing state without the policy exposing them through a separate channel.

## Non-Goals

This ADR does not decide:

- the concrete decision values returned by the policy
- the schema or representation of the policy session
- turn-budget mechanics (count, tokens, time, or otherwise)
- severity mapping, threshold tuning, or per-task-class accounting
- convergence detection or no-progress heuristics
- any specific `ReviewFixPolicy` implementation
- how policies are selected or configured at the composition root
- how the policy session interacts with run artifact storage
- diagnostics, observability, or reporting of routing decisions

## Implementation Notes

The implementation should keep the following boundaries clear:

- Orchestrator owns flow sequencing, agent invocation, and stop-on-failure
- `ReviewFixPolicy` protocol is defined alongside the Orchestrator
- Policy implementations live separately from the Orchestrator module
- Composition root wires a concrete policy into the Orchestrator
- Policy session is constructed by the policy itself; the Orchestrator only carries it

The Orchestrator's call site for the policy must be the single decision point after every review. A second routing branch elsewhere in the loop is a violation of this ADR.
