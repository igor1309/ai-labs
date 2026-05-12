---
title: "ADR: Config-Based ReviewFixPolicy"
date: 2026-04-28
model: gpt-5
description: "Reinix provides a config-based ReviewFixPolicy whose remediation budget is max remediation attempts, not total review rounds."
status: accepted
product: Reinix
scope: review policy configuration
---

# ADR: Config-Based ReviewFixPolicy

## Executive Summary

Reinix will provide a concrete config-based `ReviewFixPolicy` implementation while keeping `ReviewFixPolicy` as the Orchestrator-owned interface from ADR-006.

The default configurable budget is `maxRemediationAttempts`: the number of fix attempts allowed after the initial Producer/Reviewer round fails. This is intentionally not a total review-round limit.

Scope: concrete policy implementation shape, policy configuration ownership, and remediation budget semantics. Out of scope: changing the Orchestrator, changing provider execution, or defining a rich review verdict schema.

## Context

ADR-006 establishes that the Orchestrator delegates every post-review routing decision to an injected `ReviewFixPolicy` and must not inspect verdict severity, recurrence, or budget state.

Reinix still needs a practical, well-equipped production policy for the common workflow: remediate failed reviews until a bounded fix budget is exhausted, then fail the run. That behavior should be configurable without weakening ADR-006.

Because the policy is configurable, this ADR also needs to decide the settings surface. Leaving the file name and bootstrap behavior implicit would create a predictable drift point against ADR-007 and the repo-level CLI settings convention.

Two budget semantics are plausible:

- **Max total review rounds.** Counts the initial Producer/Reviewer pass against the budget. This is less intuitive because the first pass is not remediation.
- **Max remediation attempts.** Counts only calls that ask Remediator to produce a follow-up task. This matches the user-facing question: how many fixes may Reinix attempt after review failure?

The second shape is more explicit and easier to explain.

## Decision

Reinix will add a concrete `ConfigBasedReviewFixPolicy` implementation supplied by composition as a `ReviewFixPolicy`.

Policy configuration belongs to `policy.yaml`, not to `agents.yaml` or `models.yaml`. Reinix discovers policy settings locally before globally:

1. `./.reinix/policy.yaml`
2. `~/.reinix/policy.yaml`

Local policy settings fully replace global policy settings; Reinix must not merge them.

When production composition selects `ConfigBasedReviewFixPolicy` and no `policy.yaml` exists at either discovery location, Reinix must write `~/.reinix/policy.yaml.example` and fail startup with `StartupValidationFailure`. It must not create an active `policy.yaml`.

The remediation budget is named `maxRemediationAttempts`. It counts only `remediate` decisions already issued by the policy. The initial Producer/Reviewer round does not count against this budget.

When review output represents failure and the remediation budget has remaining attempts, `ConfigBasedReviewFixPolicy` returns `remediate`. When the budget is exhausted, it returns `complete-fail`. When review output represents success, it returns `complete-ok`.

## Rules / Invariants

- `ReviewFixPolicy` remains the Orchestrator-owned interface defined by ADR-006.
- `ConfigBasedReviewFixPolicy` MUST be a concrete implementation of `ReviewFixPolicy`, not a replacement for the interface.
- The Orchestrator MUST NOT read policy config directly.
- The Orchestrator MUST NOT count remediation attempts, review rounds, verdict severities, or failure categories.
- Policy budget state MUST live in the policy's opaque session, which the Orchestrator only threads through unchanged.
- `maxRemediationAttempts` MUST count calls that lead to a Remediator run; it MUST NOT count the initial Producer/Reviewer round.
- A `maxRemediationAttempts` value of `5` permits at most five Remediator calls and at most six Producer/Reviewer rounds for one task.
- Policy settings MUST NOT be stored in `agents.yaml` or `models.yaml`.
- Policy settings MUST be discovered from `./.reinix/policy.yaml` before `~/.reinix/policy.yaml`, with no merging.
- Missing policy settings for `ConfigBasedReviewFixPolicy` MUST bootstrap `~/.reinix/policy.yaml.example`, not an active `policy.yaml`.

## Consequences

### Positive

- The default production policy becomes usable without custom caller code for every run.
- Budget semantics are clear at the configuration boundary.
- ADR-006 remains intact: the Orchestrator stays a sequencer, and routing logic remains policy-owned.
- Tests can exercise the policy in isolation with synthetic verdicts and sessions.

### Negative

- Reinix gains another settings file and first-run bootstrap path.
- The config-based policy may not fit every workflow, so composition must continue to support custom policy injection.
- Diagnostics about budget exhaustion depend on what the policy exposes; the Orchestrator still cannot inspect session internals.

## Non-Goals

This ADR does not decide:

- the final YAML field names beyond `maxRemediationAttempts`.
- the complete schema for policy settings.
- the exact success/failure verdict vocabulary.
- how callers select between `ConfigBasedReviewFixPolicy` and custom policy injection.
- convergence detection, no-progress detection, severity thresholds, or per-task-class policy variants.
- replacing custom `ReviewFixPolicy` injection.
- changing `agents.yaml`, `models.yaml`, provider CLI adapters, run artifact storage, or failure policy.
