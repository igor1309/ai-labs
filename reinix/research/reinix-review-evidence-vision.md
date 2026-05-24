---
date: 2026-04-29
model: gpt-5
description: "Future vision for Reinix review evidence, reviewer-authored artifacts, and human-inspectable run narratives."
---

# Reinix Review Evidence Vision

## Purpose

This note captures product-direction ideas worth revisiting after the `codex-review` comparison and terminal decision artifact work.

It is intentionally not an ADR or spec. The goal is to preserve the shape of the ideas without prematurely deciding implementation details.

## Why This Should Be Separate

This belongs in a separate research file rather than inside `codex-review-plugin-comparison.md`.

The comparison file is source-specific: it records what `codex-review` does, why Reinix should not copy its Plan/Code and branch-scoped model, and what Reinix already learned from it.

This note is broader. It is a future vision for Reinix's review evidence model: how runs become inspectable, how reviewer reasoning survives, and how terminal decisions connect back to the evidence that produced them. Keeping it separate makes the idea easier to find, grow, prune, or promote into ADRs later.

## Current State

Reinix now has a policy-owned terminal decision artifact.

That artifact answers:

```text
Why did the review-improvement loop stop?
```

The artifact is produced by `ReviewFixPolicy`, persisted by the Orchestrator, and referenced from terminal run output. This preserves the key boundary: policy owns semantics; Orchestrator records.

What remains open is the run narrative before the terminal decision:

```text
What happened in each review round?
What evidence did the Reviewer produce?
What did the Remediator do with that evidence?
What changed between attempts?
Why did the policy interpret the sequence the way it did?
```

## Review Evidence Beads

One useful mental model is a string of evidence beads.

Each bead is a durable artifact or reference produced by one actor at one point in the loop. The Orchestrator should not interpret the beads, but it can preserve and link them.

Possible beads:

- initial verifiable task
- Producer completion claim
- Producer authored artifacts
- Producer verification evidence
- Reviewer verdict
- Reviewer-authored review note
- Reviewer evidence references
- Remediator follow-up task
- policy decision event
- terminal decision artifact

The value is not that every run must produce every bead. The value is that Reinix has a vocabulary for durable evidence without making the Orchestrator understand task semantics, Git branches, Plan/Code phases, or reviewer disagreement protocols.

## Reviewer-Owned Durable Artifacts

The strongest unimplemented idea from `codex-review` is not branch-scoped notes. It is durable reviewer output.

In Reinix terms, this means the Reviewer may produce an artifact that survives the run and can be inspected later.

Examples:

```text
reviews/round-1.md
reviews/round-2.md
reviews/final-verdict.md
```

The Orchestrator should not author these. It should not decide the file names based on branches, phases, commits, or pull requests.

Instead, durable review artifacts could be:

- declared in the Reviewer output schema
- required by the verifiable task
- produced as authored artifacts by the Reviewer agent
- referenced from the Reviewer semantic output
- linked from run events or a future run index

This gives Reinix the benefit of review notes without importing the plugin's branch-local `.codex-review/` model.

## Round-Level Evidence Index

Terminal artifacts explain the final policy decision. A future run evidence index could explain the whole loop.

A possible index might be machine-readable JSON plus a human-readable Markdown rendering, but that is an implementation question. The direction is more important than the format:

```text
run
  task
  round 1
    producer claim
    producer artifacts
    reviewer verdict
    reviewer artifacts
    policy decision
  round 2
    remediated task
    producer claim
    reviewer verdict
    policy decision
  terminal decision artifact
```

This should be a reporting or artifact-indexing concern, not routing logic.

The Orchestrator may already have enough event data to support parts of this later. The missing piece is a principled way for agent-authored semantic artifacts to be referenced as evidence.

## Session Continuity

`codex-review` keeps a live Codex reviewer session. Reinix intentionally does not manage provider sessions.

Still, session continuity is worth revisiting at the provider boundary.

Possible future direction:

- provider adapters expose session references when available
- run artifacts retain those references
- a future runner or operator can choose to resume context
- the Orchestrator remains session-agnostic

This keeps ADR-003 intact: Reinix invokes provider CLIs and records references, but does not own credentials, auth state, or session lifecycle.

## Stale Decision Integrity

`codex-review` protects against stale verdict files. Reinix does not use verdict files, so that exact problem does not apply.

The general concern does apply:

```text
A policy decision or terminal artifact must belong to the current run and the current review round.
```

Future integrity rules could tie decisions and artifacts to:

- run ID
- review round
- reviewer output reference
- policy decision event
- terminal artifact path

This should be considered if Reinix grows richer external artifact references, resumable runs, or human-edited policy inputs.

## Human Escalation

Accept-or-Argue should not become Orchestrator logic.

But human escalation is a real workflow shape:

```text
The policy cannot responsibly continue, and the next decision belongs to a human.
```

Today this can be represented as `complete-fail` with a terminal artifact explaining the escalation. Later, Reinix may need a distinct policy decision if it grows an operator-interaction layer.

That future decision should still preserve the boundary:

- policy decides escalation is needed
- terminal/escalation artifact explains why
- Orchestrator records and stops or waits according to a separate operator protocol
- Orchestrator does not adjudicate findings

## What Not To Revisit As Core Orchestrator Features

These remain intentionally out of scope for the Orchestrator:

- Plan/Code phases
- branch-scoped state
- Git/worktree awareness
- `APPROVED` / `CHANGES_REQUESTED` as Orchestrator vocabulary
- Accept-or-Argue as Orchestrator behavior
- Claude plugin hooks

They may be valid in a Reinix-powered product, adapter, or operator workflow, but they should not leak into the generic Orchestrator.

## Possible Future ADRs

These are candidates, not commitments:

- Reviewer-authored artifact contract
- Run evidence index
- Review round identity and artifact references
- Provider session reference persistence
- Human escalation policy decision
- Run summary rendering

## Guiding Principle

Reinix should make review loops inspectable without making the Orchestrator semantic.

Agents and policies create meaning. The Orchestrator preserves structure, sequence, and references.
