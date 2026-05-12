---
title: "ADR: Terminal Decision Artifact"
date: 2026-04-29
model: gpt-5
description: "Draft decision for policy-owned terminal artifacts explaining why Reinix leaves the review-improvement loop."
status: draft
product: Reinix
scope: review policy reporting
---

# ADR: Terminal Decision Artifact

## Executive Summary

Reinix should persist a terminal decision artifact when `ReviewFixPolicy` ends the review-improvement loop.

The artifact explains why the policy returned `complete-ok` or `complete-fail` and what evidence supports that terminal decision.

The policy owns the semantic explanation. The Orchestrator only stores the artifact and links it from run output.

Scope: terminal policy explanation artifacts. Out of scope: Plan/Code phases, branch-aware storage, Git/worktree semantics, and review disagreement protocols.

## Context

ADR-006 requires the Orchestrator to delegate every post-review routing decision to `ReviewFixPolicy`. ADR-008 provides a config-based policy that can stop remediation when the configured budget is exhausted.

Reinix currently records terminal status and a concise failure reason, but it does not have a durable artifact explaining why the policy left the improvement cycle. That makes terminal runs harder to inspect after the fact, especially when the policy fails a run because remediation budget was exhausted, progress stalled, or reviewer verification was blocked.

The `codex-review` plugin is useful prior art because it preserves review notes and a visible terminal verdict, but its Plan/Code phases and branch-scoped state are plugin-specific. Reinix's Orchestrator should stay centered on an opaque verifiable task and a generic workspace.

## Decision

`ReviewFixPolicy` may return a terminal decision artifact with `complete-ok` or `complete-fail`.

The terminal artifact is a policy-authored explanation of the final routing decision. It may include summary text, evidence references, unresolved findings, budget state, or other policy-specific reporting.

When a terminal policy result includes an artifact, the Orchestrator persists it as a run artifact and records a reference to it in terminal run output, such as final metadata or the completion event.

The Orchestrator does not author, interpret, normalize, or branch on the artifact contents.

## Rules / Invariants

- Terminal decision artifacts MUST be optional.
- Terminal decision artifacts MUST be authored by `ReviewFixPolicy`, not by the Orchestrator.
- Terminal decision artifacts MAY be returned only with terminal decisions: `complete-ok` and `complete-fail`.
- The Orchestrator MUST persist a returned terminal artifact in the run directory.
- The Orchestrator MUST expose a reference to the persisted artifact from terminal run output.
- The Orchestrator MUST NOT inspect or mutate terminal artifact semantics.
- The Orchestrator MUST NOT become aware of Plan/Code phases to support terminal artifacts.
- The Orchestrator MUST NOT become aware of Git branches, worktrees, commits, or pull requests to support terminal artifacts.
- The Orchestrator MUST NOT encode Accept-or-Argue or other review-disagreement protocols.
- Policy session contents remain opaque to the Orchestrator.

## Consequences

### Positive

- Terminal runs gain a durable explanation beyond status and a short reason string.
- Policy-specific stop conditions can be inspected after the run without leaking policy logic into the Orchestrator.
- Successful and failed terminal decisions can both point to supporting evidence.
- The design preserves ADR-006: routing and semantic explanation remain policy-owned.

### Negative

- The `ReviewFixPolicy` output surface becomes larger.
- Run storage needs a stable place for terminal artifacts.
- Policy implementations must decide how much explanation to emit without depending on Orchestrator interpretation.

## Non-Goals

This ADR does not decide:

- the final terminal artifact schema.
- whether terminal artifacts are Markdown, JSON, or another format.
- the exact run metadata or completion-event field name for the artifact reference.
- Plan/Code phases.
- branch-scoped, worktree-scoped, commit-scoped, or pull-request-scoped review storage.
- review-note survival requirements for individual Reviewer agents.
- Accept-or-Argue or any other disagreement-resolution protocol.
- changing the verifiable-task abstraction.
