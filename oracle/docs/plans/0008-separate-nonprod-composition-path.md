---
date: 2026-02-22
model: gpt-5
description: "Implementation plan to move deterministic E2E wiring into test-owned SUT harness and complete dependency-validation coverage"
---

# Deterministic Test Harness Separation Plan

## Full Review (Source of Truth)
### Finding 1
- Verdict: fail
- Problem: deterministic stub behavior is embedded in the production assembler path, which violates composition-root rules that prohibit inline fake/stub business behavior in assemblers. Deterministic doubles for browser E2E are test-owned SUT wiring and must live in tests, not in app composition.
- Locations:
- `oracle/apps/am-i-done-api/src/worker-fetch-assembler.js:26`
- `oracle/apps/am-i-done-api/src/worker-fetch-assembler.js:32`
- `oracle/apps/am-i-done-api/src/worker-fetch-assembler.js:190`
- `oracle/apps/am-i-done-api/src/worker-fetch-assembler.js:219`
- Required fix: keep production assembler real-provider only and move deterministic doubles to a test-owned SUT harness under tests.

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

## Execution Lock (Mandatory)
1. Start in a new, separate git worktree for this plan and use a dedicated branch.
2. Execute one plan step at a time; do not overlap step scopes.
3. For each step, reach green before proceeding:
   - run required targeted tests for the step,
   - run full suite `./scripts/run_silent.sh "tests" npm test`,
   - proceed only if green.
4. When a step is green, create a step commit for implementation changes.
5. Self-review immediately after the step commit.
6. If self-review finds fail/warning issues, fix immediately, re-run tests to green, and commit fixes.
7. Mark the implemented step as done in this plan and commit the plan status update.
8. Repeat the same process for the next step.
9. After all steps are done, run final gates:
   - `./scripts/run_silent.sh "build" npx tsc --noEmit`
   - `./scripts/run_silent.sh "tests" npm test`
   - if tests/build fail, fix first and re-run until green.
10. Move this plan file to `oracle/docs/plans/implemented/`, commit the move, then create a PR.

## Progress Tracker
- [x] Step 1 complete
- [x] Step 2 complete
- [ ] Step 3 complete
- [ ] Final gates green
- [ ] Plan moved to `implemented/`
- [ ] PR created
- Build gate currently blocked in this environment: `./scripts/run_silent.sh "build" npx tsc --noEmit` fails because `npx` cannot reach npm registry (`ENOTFOUND proxy.enoa.ai`) and no local `tsc` binary is installed.

## Step 1: Move Deterministic Wiring to Test-Owned SUT Harness (Finding 1)
### Changes
- Make production assembler path real-provider only:
- remove deterministic stub-provider construction and selection from `oracle/apps/am-i-done-api/src/worker-fetch-assembler.js`.
- add deterministic test SUT wiring under tests (not app composition files):
- create test harness file(s) under test-owned location (for example `oracle/apps/am-i-done-web/tests/support/`).
- keep deterministic doubles private to test harness wiring and out of production assembler path.
- route CI/local deterministic runs that currently rely on `MODEL_PROVIDER_MODE=stub` to the test harness path.
- update docs/config references that describe wiring selection so production path and test-owned SUT harness path are explicit.
- update `oracle/README.md`:
- remove runtime/deploy guidance that implies `MODEL_PROVIDER_MODE=stub` in production composition.
- document deterministic E2E/local usage through the test-owned harness path.
- update `oracle/apps/am-i-done-api/.dev.vars.example`:
- remove or reword stub-mode guidance if it implies production runtime selection inside app composition.

### Verification
- Targeted:
- `./scripts/run_silent.sh "tests" node --test oracle/apps/am-i-done-api/tests/worker-fetch-assembler.test.js`
- `./scripts/run_silent.sh "tests" node --test oracle/apps/am-i-done-web/tests/web-e2e.test.js`
- Full suite:
- `./scripts/run_silent.sh "tests" npm test`

### Commit
- `move deterministic wiring to test harness`
- then update this plan tracker (`Step 1 complete`) and commit the tracker change.

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
- then update this plan tracker (`Step 2 complete`) and commit the tracker change.

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
- update this plan tracker (`Step 3 complete` and `Final gates green`) and commit the tracker change.
- move this plan to `oracle/docs/plans/implemented/`, commit the move.
- create PR with the full change set from this plan branch/worktree.
