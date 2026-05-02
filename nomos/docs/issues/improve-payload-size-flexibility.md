---
date: 2026-04-27
model: gpt-5
description: "Ticket to improve Nomos JSON payload size configuration"
---

# Improve Payload Size Flexibility

## Problem

Large local-ledger synthesis requests can exceed Nomos' JSON body parser limit before model context limits are relevant. The implementation needs an intentional Nomos payload-size policy instead of ad hoc deploy edits.

This ticket must not assume infrastructure topology or mutate production deployment behavior without proving the deploy path and honoring the staging-to-production promotion gate.

## Requirements

- Add failing tests first for configurable JSON body-size behavior.
- Define the configuration surface for the effective JSON body limit.
- Validate invalid limit values with a clear startup/config error.
- Keep the default behavior explicit and documented.
- Update README/log and Nomos deployment docs if the configuration changes operator behavior.
- Preserve ADR-0003 staging-then-production promotion semantics for any deploy or Compose changes.

## Acceptance Criteria

- Operators can configure the Nomos JSON payload limit intentionally.
- Tests cover default behavior, configured behavior, and invalid configuration.
- Documentation explains when to raise the limit and what component enforces it.
- Release/deploy changes, if any, are limited to the configuration needed for this behavior and are verified through the normal gates.
