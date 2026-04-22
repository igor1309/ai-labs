---
date: 2026-04-22
model: opus-4.7-adaptive
version: 0.0.1
---

# Regentara Orchestration

*Initial draft — records ideas and architecture-level concepts. Not exhaustive, not complete.*

## Simplifying assumptions

- All agent calls are async and failable.
- Any agent failure stops the flow (intentional simplification for now).
- Work is performed in a separate workspace.

## Core invariant

The flow is a recursive composition over a single primitive: a **valid task** — a verifiable task, i.e. one containing "done" criteria. Every entry point to the Orchestrator's loop — initial input and Remediator output alike — is a valid task. The Orchestrator has no separate "fresh task" vs "fix task" code paths.

## Actors

Three agents, all flow-ignorant peers. Each is defined by a typed input/output contract, unaware of each other or of the loop.

- **Producer** (Sonnet-level). Input: valid task. Performs the task and returns a list of artifacts as a grounded claim of completion, carrying evidence against the done criteria and the walked checklist. No judgment — the claim is grounded in the task's own done criteria.

- **Reviewer** (Opus-level). Input: the task and the work. Produces a structured verdict — adversarial and broad: structure, clarity, quality, and completeness beyond the stated criteria. Reviewer assesses *the work*; Producer grounds *the claim*. Review schema is reused from the existing review skill.

- **Remediator** (Opus-level). Input: the task, the work, and the review verdict. Produces a valid task — a fix plan conforming to the same verifiable-task contract the Orchestrator accepts at entry. Knows nothing about the flow.

The **Orchestrator** coordinates the flow: owns the workspace, sequences agent calls, enforces stop-on-failure. It does not adjudicate — it consults `ReviewFixPolicy` for every routing decision. The call graph is a tree: Orchestrator → {Producer, Reviewer, Remediator, ReviewFixPolicy}. Agents never invoke each other or the Orchestrator.

## Flow

1. Orchestrator receives a valid task.
2. Orchestrator calls Producer. On failure, stop. On success, Producer returns a list of artifacts.
3. Orchestrator calls Reviewer. On failure, stop. On success, Reviewer returns a structured verdict.
4. Orchestrator calls `ReviewFixPolicy` with the verdict and the current session. Policy returns a decision — one of `complete-ok`, `complete-fail`, `remediate` — and the session for the next round.
5. On `remediate`, Orchestrator calls Remediator, receives a new valid task, and re-enters step 2.

## ReviewFixPolicy

A protocol injected into the Orchestrator. The adjudicator of the flow. Given a verdict and the current session, returns a routing decision and the session for the next round. The Orchestrator is the courier of the session across rounds — it threads it through but does not inspect it.

Policy owns:

- **Turn budget** — whether the loop can afford another round.
- **Routing decision** — where the flow goes next based on verdict severity and session state.
- **Session** — an opaque object threaded across rounds, enabling cross-round reasoning (no-progress detection, iteration-over-iteration comparison, per-task-class accounting, etc.).

Example behaviors one concrete policy might implement:

- No failures, no warnings → `complete-ok`.
- F1 failures present, budget exhausted → `complete-fail`.
- F2-only failures, budget remaining → `remediate`.
- Same F2 finding recurring across rounds (via session) → `complete-fail`, even with budget remaining.

Threshold tuning, severity mapping, per-task-class policies, and convergence detection are all policy concerns and evolve independently of the Orchestrator.

## Out of scope for this draft

Acknowledged and intentionally deferred, not forgotten:

- **Context management** between agents — what exactly Producer returns, what Reviewer inspects, how artifacts are framed. A separate concern with its own responsibility; deliberately not mixed into this doc.
- **Workspace lifecycle** — creation, integration on success, cleanup on stop/exhaustion. Simple, to be specified.
- **Review verdict schema** — reused from the existing review skill.

## Addendum: coding-task specialization

When the task is a coding change:

- Workspace → git worktree.
- Artifacts → commits.