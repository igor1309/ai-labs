---
date: 2026-02-22
model: gpt-5
description: "Implementation plan to separate non-production composition wiring and complete dependency-validation coverage"
---

# Separate Non-Prod Composition Path Plan

## Full Review (Source of Truth)
### Finding 1
- Verdict: fail
- Problem: deterministic stub behavior is embedded in the production assembler path, which violates composition-root rules that prohibit inline fake/stub business behavior in assemblers and require deterministic non-production doubles to be wired through a separate non-production composition entrypoint/harness.
- Locations:
- `oracle/apps/am-i-done-api/src/worker-fetch-assembler.js:26`
- `oracle/apps/am-i-done-api/src/worker-fetch-assembler.js:32`
- `oracle/apps/am-i-done-api/src/worker-fetch-assembler.js:190`
- `oracle/apps/am-i-done-api/src/worker-fetch-assembler.js:219`
- Required fix: keep production assembler real-provider only and move deterministic doubles to a separate non-production composition entrypoint/harness.

### Finding 2
- Verdict: warning
- Problem: wiring dependency-validation test coverage is incomplete against the guide expectation to validate missing and invalid-shape failures for every required collaborator.
- Location:
- `oracle/packages/worker-api/tests/worker-api.composition.test.js:6`
- Required fix: add missing/invalid dependency tests for `professionNormalizer.normalize`, `professionOutlookService.getOutlook`, and `requestIdGenerator`.

## Scope
- Fix only the two findings above.
- Keep business behavior unchanged.
- Keep changes surgical to composition wiring, composition tests, and required docs/config references.

## Step 1: Separate Non-Production Composition Wiring (Finding 1)
### Changes
- Make production assembler path real-provider only:
- remove deterministic stub-provider construction and selection from `oracle/apps/am-i-done-api/src/worker-fetch-assembler.js`.
- add a separate non-production composition harness/entrypoint for deterministic doubles:
- create non-production wiring file(s) under `oracle/apps/am-i-done-api/src/` (for example `worker-fetch-nonprod-harness.js` and `index.nonprod.js`).
- keep deterministic doubles private to non-production wiring and out of production assembler path.
- route CI/local deterministic runs that currently rely on `MODEL_PROVIDER_MODE=stub` to the non-production harness path.
- update docs/config references that describe wiring selection so production and non-production paths are explicit.

### Verification
- Targeted:
- `./scripts/run_silent.sh "tests" node --test oracle/apps/am-i-done-api/tests/worker-fetch-assembler.test.js`
- `./scripts/run_silent.sh "tests" node --test oracle/apps/am-i-done-web/tests/web-e2e.test.js`
- Full suite:
- `./scripts/run_silent.sh "tests" npm test`

### Commit
- `separate nonprod composition wiring`

## Step 2: Complete Wiring Dependency-Validation Coverage (Finding 2)
### Changes
- Extend `oracle/packages/worker-api/tests/worker-api.composition.test.js` with missing and invalid-shape tests for each uncovered required collaborator:
- `professionNormalizer.normalize`
- `professionOutlookService.getOutlook`
- `requestIdGenerator`
- keep one-assertion intent per test name and preserve current test style/helpers.

### Verification
- Targeted:
- `./scripts/run_silent.sh "tests" node --test oracle/packages/worker-api/tests/worker-api.composition.test.js`
- Full suite:
- `./scripts/run_silent.sh "tests" npm test`

### Commit
- `cover composition dependency validation gaps`

## Step 3: Final Closeout
### Changes
- self-review changed files against `oracle/docs/composition-root-wiring-guide.md`.
- ensure no production path references deterministic doubles.
- ensure no out-of-scope files are included.

### Verification
- Build gate:
- `./scripts/run_silent.sh "build" npx tsc --noEmit`
- Full suite:
- `./scripts/run_silent.sh "tests" npm test`

### Commit
- no extra commit unless Step 1 or Step 2 fixes are required by closeout review.
