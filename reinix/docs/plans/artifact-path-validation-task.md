---
date: 2026-04-28
model: gpt-5
description: "Reinix task for clean invalid artifact path failures"
---

# Artifact Path Validation Task

## Task

Fix Reinix artifact path validation.

## Current Problem

When a Producer returns a non-empty `artifact` value that is not a plausible authored artifact path, Reinix may pass that value into filesystem access and surface a raw filesystem error such as `ENAMETOOLONG`.

This happened when the `artifact` field contained a long Markdown body instead of a relative artifact path.

## Expected Behavior

- Reinix should fail with `RuntimeFailure` before raw filesystem errors leak for invalid authored artifact paths.
- The failure reason should clearly say the authored artifact path is invalid.
- Keep the existing behavior that an empty string artifact means no artifact lookup.
- Keep the change scoped to artifact path validation and related tests.
- Do not change provider CLI execution, model routing, policy behavior, or settings schemas.

## Suggested Implementation Area

- `reinix/src/artifact-store.js`
- Existing artifact/failure tests under `reinix/tests/`

## Verification

- Add or update tests that cover a long or prose artifact value and assert a clean Reinix runtime failure.
- Run `./scripts/run_silent.sh "reinix-tests" node --test reinix/tests/*.test.js`.
- Run `./scripts/run_silent.sh "tests" npm test`.
- Run `./scripts/run_silent.sh "build" npx tsc --noEmit`.

## Producer Output

Return structured output with `artifact` set to an empty string after making the code and test changes.
