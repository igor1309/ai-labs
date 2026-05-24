---
title: "ADR: MVP Fail-Fast Failure Policy"
date: 2026-04-25
model: gpt-5.5-thinking
description: "MVP fail-fast failure policy: stop runs on first runtime failure; pre-run validation must not create a run."
status: accepted
product: Reinix
scope: failure policy
---

# ADR: MVP Fail-Fast Failure Policy

## Executive Summary

Reinix uses a fail-fast failure policy for the MVP. Any runtime failure after workflow execution has started stops the current run immediately and marks it failed; pre-run validation failures must not create a run. Reinix does not retry failed steps, does not continue past a failed step, does not impose subprocess timeouts, and does not define advanced cancellation semantics. Already-created artifacts are preserved. Failed runs return a non-zero exit code and print a concise failure reason. Workflow execution semantics, process-control, artifact layout, diagnostics, and observability are out of scope and deferred to dedicated ADRs.

## Status

Accepted

## Context

Reinix orchestrates an agent workflow by invoking existing provider CLIs as headless subprocesses.

For the MVP, Reinix should keep failure handling simple, deterministic, and easy to reason about.

Reinix must not introduce retry, repair, timeout, or process-control behavior before those behaviors are explicitly designed.

"Workflow execution has started" means startup validation passed and Reinix created a run record. Failures from that point are runtime failures; failures before that point are pre-run failures.

## Decision

Reinix will use a fail-fast failure policy for the MVP.

If a runtime failure occurs after workflow execution has started, Reinix must stop the current run immediately and mark it failed.

Reinix must not retry failed steps in the MVP.

Reinix must not continue the workflow after a failed step.

## Runtime Failure Classes

This ADR covers the following runtime failure classes:

- subprocess non-zero exit
- invalid runtime JSON output
- missing expected artifact
- user interruption / cancellation

If any covered runtime failure occurs, Reinix must fail the current run immediately.

## Startup Validation Failures

Configuration validation failures are pre-run failures.

This includes invalid `agents.yaml`, invalid `models.yaml`, and other startup validation failures decided by their own ADRs.

If startup validation fails:

- Reinix must not start workflow execution.
- Reinix must not create a Reinix run.
- Reinix must return a non-zero exit code.
- Reinix must print a concise failure reason.

Settings-specific validity rules remain owned by the relevant settings ADRs.

## Artifact Preservation

If runtime failure occurs after workflow execution has started, Reinix must preserve artifacts that were already created before the failure.

Reinix must not fabricate missing artifacts.

If an expected artifact is missing, Reinix must treat that as a runtime failure.

The exact artifact model, file naming, layout, and metadata are deferred to the Run Artifact Storage and Mutation Policy ADR.

## Invalid Runtime JSON Output

If an agent produces runtime output that cannot be parsed as valid JSON or does not satisfy the configured output JSON Schema, Reinix must fail the current run immediately.

Invalid runtime JSON output is treated as a runtime failure.

## Subprocess Failure

If a provider CLI subprocess exits with a non-zero status, Reinix must fail the current run immediately.

For the MVP, the observed subprocess result is the source of truth.

Reinix must not infer success from partial files or logs if the subprocess itself failed.

## Timeout Policy

Reinix does not impose subprocess timeouts in the MVP.

If the underlying CLI hangs, stalls, or waits indefinitely, Reinix does not apply an automatic timeout.

Timeout behavior is deferred to a future dedicated process-control ADR.

## Cancellation Policy

Reinix does not define advanced cancellation semantics in the MVP.

If the user interrupts Reinix, the current run stops.

If the user interrupts Reinix before workflow execution has started, no run is created and Reinix exits with a non-zero code.

If workflow execution had already started, Reinix marks the run failed.

Reinix records only the subprocess outcome it can observe.

Detailed signal forwarding, graceful termination, force-kill behavior, process-group handling, and subprocess cleanup are deferred to a future dedicated process-control ADR.

## Exit Behavior

For failed runs, Reinix must:

- return a non-zero exit code
- print a concise failure reason

Detailed diagnostic reporting, artifact references, session references, and observability output are deferred to later ADRs.

## Consequences

### Positive

- MVP failure behavior is simple and deterministic.
- Reinix avoids hiding failures behind implicit retries.
- Downstream workflow steps never run after a failed step.
- Already-created artifacts remain available for inspection.
- Process-control complexity is deferred.

### Negative

- Temporary provider CLI failures stop the run.
- Network interruptions are not retried by Reinix.
- Hung subprocesses require external/user intervention.
- Failed runs may leave partial artifact sets.
- Detailed recovery and cleanup behavior is not defined in MVP.

## Non-Decisions

This ADR does not decide:

- retry behavior after failure
- repair behavior after failure
- automatic recovery behavior
- timeout enforcement
- signal forwarding
- graceful subprocess termination
- force-kill behavior
- subprocess cleanup
- process-group handling
- artifact file layout
- artifact metadata
- detailed diagnostic reporting
- observability schema
- session trace model

## Implementation Notes

The implementation should keep the following states distinct:

- pre-run validation failure
- started run failure
- successful run completion

Startup validation failure must not create a Reinix run.

Runtime failure after workflow start must mark the current run failed.

Workflow execution must stop at the first failed step.
