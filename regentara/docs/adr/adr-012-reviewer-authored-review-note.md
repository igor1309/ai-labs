---
title: "ADR: Reviewer-Authored Review Note"
date: 2026-04-29
model: claude-opus-4-7
description: "Decision that the Reviewer authors a Markdown review note each round and Regentara persists it as a durable run artifact."
status: draft
product: Regentara
scope: review evidence
---

# ADR: Reviewer-Authored Review Note

## Executive Summary

The Reviewer agent authors a Markdown review note alongside its structured verdict on every review round.

Regentara persists the review note as a durable run artifact and references it from the corresponding `agent-end` event. The Orchestrator does not interpret the note.

The Reviewer owns the narrative explanation. The Orchestrator only stores the artifact and links it from run output.

Scope: per-round Reviewer-authored review notes. Out of scope: Reviewer-declared filenames, evidence-bead indexes spanning multiple agents, Plan/Code phases, branch-aware storage, Git/worktree semantics, and review disagreement protocols.

## Context

ADR-011 introduced policy-authored terminal decision artifacts. They explain why `ReviewFixPolicy` left the review-improvement loop, but they do not preserve what happened inside the loop.

Today, when the policy decides `remediate`, the Reviewer's reasoning for that round is discarded after the policy fires. The Orchestrator keeps an in-memory `reviewHistory` list during the run, but no per-round artifact survives. Multi-round runs become difficult to inspect because the verdict alone does not reveal which files were reviewed, which verification commands actually ran, or why the Reviewer stopped short of `accepted`.

The Reviewer prompt today forbids narrative in semantic JSON fields unless the schema explicitly asks for them. As a result, current verdicts are tag-shaped strings carrying no durable explanation.

The `regentara-review-evidence-vision.md` research note identifies "Reviewer-Owned Durable Artifacts" as the strongest unimplemented direction from the `codex-review` comparison. This ADR commits to the smallest version of that direction: one Markdown review note per round, authored by the Reviewer, persisted by the Orchestrator, never interpreted by the Orchestrator.

Rejected alternatives:

- Optional review note. Leaves the inspectability gap; multi-round runs can still produce no durable narrative.
- Reviewer-declared filenames. Couples agent semantics to run storage layout. Deferred until there is a real need for multiple artifacts per round.
- Multi-artifact evidence-bead schema (e.g. `evidenceArtifacts: string[]`). Larger contract change than the current gap requires; would precommit to a shape before the simpler note has been exercised.
- Logging the verdict text into events only. Events are observability-shaped, not durable run artifacts; they do not satisfy the "evidence beads" model from the vision note.

## Decision

The Reviewer agent's output schema requires a Reviewer-authored review note in addition to the existing structured verdict and verification report.

The review note is a Markdown narrative authored by the Reviewer that explains what was reviewed, what verification was performed, and the reasoning behind the verdict.

When a Reviewer round completes, Regentara persists the review note as a durable artifact in the run directory and exposes a reference to it from the corresponding `agent-end` event.

The Orchestrator does not author, interpret, normalize, parse, or branch on the review note. The persisted artifact path is owned by the Orchestrator; the artifact content is owned by the Reviewer.

## Rules / Invariants

- The Reviewer output schema MUST require a Reviewer-authored review note field.
- The review note MUST be authored by the Reviewer agent, not by the Orchestrator.
- The review note MUST be authored on every Reviewer round, not only on terminal rounds.
- Regentara MUST persist the review note as a durable run artifact in the run directory.
- Regentara MUST reference the persisted review note from the round's `agent-end` event.
- Regentara MUST NOT inspect, parse, normalize, or branch on review note content.
- Regentara MUST NOT overwrite a previously persisted review note for the same round.
- Regentara MUST fail the run with a runtime failure when review note persistence fails.
- The Reviewer MUST NOT decide the review note's persisted filename or directory.
- The Orchestrator MUST persist review notes from per-round Reviewer output only, not from policy output.
- Inline reviewer output schemas that drop the review note field MUST fail startup validation with a remediation pointer.
- The Orchestrator MUST NOT become aware of Plan/Code phases to support review notes.
- The Orchestrator MUST NOT become aware of Git branches, worktrees, commits, or pull requests to support review notes.
- The Orchestrator MUST NOT encode Accept-or-Argue or other review-disagreement protocols to support review notes.

## Consequences

### Positive

- Multi-round runs gain durable, per-round narrative evidence.
- Reviewer reasoning survives the policy decision and the run.
- Terminal decision artifacts (ADR-011) gain implicit context: the prior rounds' review notes explain how the policy reached its terminal state.
- Establishes a concrete first instance of "Reviewer-Owned Durable Artifacts" without precluding a future multi-artifact contract.
- Preserves the boundary from ADR-006 and ADR-011: agents and policies create meaning; the Orchestrator preserves structure and references.

### Negative

- Reviewer output schema becomes larger and breaking for any inline reviewer schemas that omit the review note field.
- Run storage gains a new artifact category that must be discoverable alongside producer artifacts and terminal decision artifacts.
- The Reviewer agent must produce useful narrative content; an unhelpful review note is undetectable by the Orchestrator and only visible during human inspection.
- The "no narrative in semantic JSON fields" rule in the Reviewer prompt requires a carve-out for the new field.

## Non-Goals

This ADR does not decide:

- the field name on the Reviewer output schema.
- the persisted artifact's filename, naming pattern, or directory.
- the Markdown structure or required sections of the review note.
- the field name used to reference review notes in events or run metadata.
- whether review notes are also rendered into a future run-evidence index.
- review notes authored by agents other than the Reviewer.
- multi-artifact Reviewer evidence contracts (e.g. evidence references, supporting logs).
- Reviewer-declared persisted paths.
- session continuity or resumable Reviewer sessions.
- Plan/Code phases.
- branch-scoped, worktree-scoped, commit-scoped, or pull-request-scoped review storage.
- Accept-or-Argue or any other disagreement-resolution protocol.
- changes to the verifiable-task abstraction.
- changes to the terminal decision artifact contract from ADR-011.
