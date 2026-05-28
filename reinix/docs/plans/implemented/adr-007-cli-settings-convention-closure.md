---
date: 2026-04-27
model: Claude Opus 4.7
description: "Closure plan for adr-007: relax closed catalog whitelists, add cross-file route-key resolution, add first-run bootstrap, align tests."
---

# ADR-007 CLI Settings Convention Closure Plan

> **For agentic workers:** REQUIRED: Follow this plan task-by-task. Use `dev-skills/public/strict-tdd` and `dev-skills/public/process-gates` for every code, config, CI, dependency, release, or generated-artifact change. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Close the violations recorded by `adr-007-cli-settings-convention-adoption.md` against `reinix/src/settings/agent-settings.js`, `reinix/src/settings/model-routing.js`, and the missing first-run bootstrap, and align tests with the updated `mvp-workflow-runner.md` spec.

**Architecture:** Edits are scoped to existing Reinix modules. No new modules unless required by a focused work item. Test changes happen alongside source changes per strict-TDD.

## Source Documents

- `docs/adr/cli-settings-convention.md`
- `reinix/docs/adr/adr-007-cli-settings-convention-adoption.md`
- `reinix/docs/specs/mvp-workflow-runner.md` (renumbered tests 1–59)

## Execution Mode

Mode: auto-continue
Human review between tasks: no
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption
Push policy: no push until final closeout unless the user explicitly asks
Final archive: move this plan to `reinix/docs/plans/implemented/` after all tasks complete and gates pass

## Execution Lock

Worktree mode: reuse current
Expected worktree: `worktrees/reinix-mvp-workflow-runner`
Expected branch: `codex/reinix-mvp-workflow-runner`

Before Task 1:

1. Run `git worktree list --porcelain`.
2. Run `git branch --show-current`.
3. Confirm worktree is `worktrees/reinix-mvp-workflow-runner` and branch is `codex/reinix-mvp-workflow-runner`.
4. Emit `Preflight: worktree=<path>, branch=<branch>, separate_worktree=<pass|fail>`.
5. If preflight fails, halt before editing files.

## Scope Guardrails

- Do not change agent identifier inventory (`producer`, `reviewer`, `remediator`); they remain structural per adr-007.
- Do not change `SUPPORTED_SCHEMA_REFS`; it remains structural per adr-007.
- Do not introduce new public modules unless a task explicitly requires one.
- Do not change provider CLI execution, run-store, artifact-store, runtime-output, or workflow sequencing logic.
- Do not push to remote until final closeout.

## Testing Discipline

- One behavior at a time.
- Compilation/module-resolution failures are not RED.
- A valid RED must run and fail with an assertion that states the missing behavior.
- GREEN must contain only the minimal code required by that RED.
- Refactor only on green. Run targeted tests after each refactor.
- Commit after green gates. No TDD-process text in commit messages.
- Use existing test helpers for temporary home and cwd directories.

## Verification Commands

Targeted Reinix tests:

```bash
./scripts/run_silent.sh "reinix-tests" node --test reinix/tests/*.test.js
```

Full Node/TypeScript gates required before closeout:

```bash
./scripts/run_silent.sh "tests" npm test
./scripts/run_silent.sh "build" npx tsc --noEmit
```

## Task 1: Relax Model Routing Catalog Whitelists

**Objective:** Remove closed `REQUIRED_ROUTE_KEYS`, closed provider list, closed runner list, and closed `SUPPORTED_COMBINATIONS` from `model-routing.js`. Keep structural validation: each route entry must define `provider`, `runner`, `model`. Spec tests covered: removal of legacy closed-whitelist tests; preservation of structural-field test (current spec test 22).

**Files:**

- Modify: `reinix/src/settings/model-routing.js`
- Modify: `reinix/tests/model-routing.test.js`
- Modify: `reinix/docs/log.md`

**Key Work Items:**

- [x] Remove tests asserting rejection of unknown route key, missing-of-fixed-set route keys, unsupported provider, unsupported runner, and invalid provider/runner combination. Run RED to confirm they are gone.
- [x] Remove `REQUIRED_ROUTE_KEYS`, `SUPPORTED_COMBINATIONS`, and the provider/runner closed-list checks from `model-routing.js`.
- [x] Preserve validation for: parse error, missing `routes` mapping, missing required field per route entry.
- [x] Confirm structural-field test (missing `provider`, `runner`, or `model`) still passes.
- [x] Update `reinix/docs/log.md` with a one-line outcome entry.

**Validation:**

```bash
./scripts/run_silent.sh "reinix-tests" node --test reinix/tests/*.test.js
```

**Completion Signal:** `model-routing.js` accepts arbitrary route keys and arbitrary provider/runner strings; only structural problems are rejected.

**Commit:**

```bash
git add reinix/src/settings/model-routing.js reinix/tests/model-routing.test.js reinix/docs/log.md
git commit -m "reinix: relax model routing catalog whitelists per adr-007"
```

## Task 2: Relax Agent Settings Prompt Reference Whitelist

**Objective:** Remove closed `SUPPORTED_PROMPT_REFS` from `agent-settings.js`. Keep `SUPPORTED_SCHEMA_REFS` intact (structural). Spec tests covered: removal of unsupported-prompt-reference test; preservation of unsupported-output-schema-reference test (current spec test 14).

**Files:**

- Modify: `reinix/src/settings/agent-settings.js`
- Modify: `reinix/tests/agent-settings.test.js`
- Modify: `reinix/docs/log.md`

**Key Work Items:**

- [x] Remove the test asserting rejection of unsupported prompt reference. Run RED to confirm it is gone.
- [x] Remove `SUPPORTED_PROMPT_REFS` and the prompt-ref closed-list check from `agent-settings.js`.
- [x] Keep prompt structural validation: prompt must be a mapping with a string `ref` field.
- [x] Confirm `SUPPORTED_SCHEMA_REFS` remains and the unsupported-output-schema test still passes.
- [x] Update `reinix/docs/log.md`.

**Validation:**

```bash
./scripts/run_silent.sh "reinix-tests" node --test reinix/tests/*.test.js
```

**Completion Signal:** `agent-settings.js` accepts arbitrary prompt-ref strings; output-schema-ref closed list remains.

**Commit:**

```bash
git add reinix/src/settings/agent-settings.js reinix/tests/agent-settings.test.js reinix/docs/log.md
git commit -m "reinix: relax agent settings prompt reference whitelist per adr-007"
```

## Task 3: Cross-File Route-Key Resolution Check

**Objective:** Add a startup-validation rule that fails when `agents.yaml` references a route key not defined in `models.yaml`. Spec test covered: current spec test 23.

**Files:**

- Modify: relevant settings entry point (`agent-settings.js`, `model-routing.js`, or a new small composition shim — pick the smallest seam without expanding the public surface).
- Modify: corresponding test file.
- Modify: `reinix/docs/log.md`

**Key Work Items:**

- [x] Add a RED test asserting that startup fails with `StartupValidationFailure` when `agents.yaml` references a route key not defined in `models.yaml`. Confirm the test fails by assertion.
- [x] Add the minimum GREEN check at the smallest reasonable seam.
- [x] Confirm error message names the offending agent identifier and the unresolved route key.
- [x] Confirm no other startup tests regress.
- [x] Update `reinix/docs/log.md`.

**Validation:**

```bash
./scripts/run_silent.sh "reinix-tests" node --test reinix/tests/*.test.js
```

**Completion Signal:** Cross-file route-key resolution is enforced at startup with a clear error.

**Commit:**

```bash
git add reinix/src reinix/tests reinix/docs/log.md
git commit -m "reinix: enforce cross-file route key resolution at startup"
```

## Task 4: First-Run Bootstrap for `agents.yaml.example`

**Objective:** When `agents.yaml` is missing at both locations, write `~/.reinix/agents.yaml.example` before failing, idempotent (no overwrite), without writing an actual `agents.yaml`. Spec tests covered: current spec tests 1–4.

**Files:**

- Modify: `reinix/src/settings/agent-settings.js` (or a small new helper if cleaner; prefer modifying in place).
- Create: an example template file source if the implementation reads it from disk; otherwise inline a small constant.
- Modify: `reinix/tests/agent-settings.test.js` and any home/cwd helper to assert file writes.
- Modify: `reinix/docs/log.md`

**Key Work Items:**

- [x] RED: assert `~/.reinix/agents.yaml.example` is written when no `agents.yaml` exists at either location.
- [x] GREEN: write the example, then continue with the existing `StartupValidationFailure` throw.
- [x] RED: assert an existing `~/.reinix/agents.yaml.example` is not overwritten (e.g., write a sentinel file, run, verify content unchanged).
- [x] GREEN: guard the write with an existence check.
- [x] RED: assert no `agents.yaml` is written during bootstrap.
- [x] GREEN: verify implementation only writes the example file.
- [x] Confirm the failing-when-missing test (spec test 1) still passes.
- [x] Update `reinix/docs/log.md`.

**Validation:**

```bash
./scripts/run_silent.sh "reinix-tests" node --test reinix/tests/*.test.js
```

**Completion Signal:** Missing `agents.yaml` triggers a non-overwriting `agents.yaml.example` write, then fails.

**Commit:**

```bash
git add reinix/src reinix/tests reinix/docs/log.md
git commit -m "reinix: bootstrap agents.yaml.example on first run"
```

## Task 5: First-Run Bootstrap for `models.yaml.example`

**Objective:** Symmetric to Task 4 for `models.yaml`. Spec tests covered: current spec tests 16–18.

**Files:**

- Modify: `reinix/src/settings/model-routing.js` (or shared bootstrap helper if Task 4 introduced one).
- Modify: `reinix/tests/model-routing.test.js`.
- Modify: `reinix/docs/log.md`.

**Key Work Items:**

- [x] RED/GREEN cycle for: example written when missing, idempotency, no actual `models.yaml` written.
- [x] Confirm the failing-when-missing test (spec test 15) still passes.
- [x] Update `reinix/docs/log.md`.

**Validation:**

```bash
./scripts/run_silent.sh "reinix-tests" node --test reinix/tests/*.test.js
```

**Completion Signal:** Missing `models.yaml` triggers a non-overwriting `models.yaml.example` write, then fails.

**Commit:**

```bash
git add reinix/src reinix/tests reinix/docs/log.md
git commit -m "reinix: bootstrap models.yaml.example on first run"
```

## Task 6: Partial-Bootstrap Behavior

**Objective:** When only one of `agents.yaml` or `models.yaml` is missing, write only the missing example. Spec test covered: current spec test 19.

**Files:**

- Modify: whichever module orchestrates startup validation across both files.
- Modify: corresponding test file.
- Modify: `reinix/docs/log.md`.

**Key Work Items:**

- [x] RED: assert only `agents.yaml.example` is written when `agents.yaml` is missing but `models.yaml` exists. Symmetric assertion for the reverse case.
- [x] GREEN: ensure each settings file's bootstrap is independent of the other's presence.
- [x] Update `reinix/docs/log.md`.

**Validation:**

```bash
./scripts/run_silent.sh "reinix-tests" node --test reinix/tests/*.test.js
```

**Completion Signal:** Per-file bootstrap is independent.

**Commit:**

```bash
git add reinix/src reinix/tests reinix/docs/log.md
git commit -m "reinix: independent per-file first-run bootstrap"
```

## Task 7: Named Error Surface for Startup Validation

**Objective:** Confirm every startup-validation failure path surfaces a `StartupValidationFailure` whose message names the offending settings file or rule. Spec test covered: current spec test 25.

**Files:**

- Modify: `reinix/src/errors.js` if message construction needs refinement.
- Modify: source files that throw startup failures (only if their messages omit the file or rule name).
- Modify: corresponding test file with one consolidated assertion across failure paths.
- Modify: `reinix/docs/log.md`.

**Key Work Items:**

- [x] Audit every `throw new StartupValidationFailure(...)` site introduced or touched in Tasks 1–6 plus the existing pre-task sites; confirm each message names the file or rule.
- [x] RED: add a test that exercises a representative subset of failure paths and asserts the error name and that the message contains the expected file or rule name.
- [x] GREEN: adjust messages where missing.
- [x] Update `reinix/docs/log.md`.

**Validation:**

```bash
./scripts/run_silent.sh "reinix-tests" node --test reinix/tests/*.test.js
```

**Completion Signal:** All startup-validation failures are `StartupValidationFailure` instances with file-or-rule-naming messages.

**Commit:**

```bash
git add reinix/src reinix/tests reinix/docs/log.md
git commit -m "reinix: name offending file or rule on every startup failure"
```

## Task 8: Closeout

**Objective:** Move the spec and this plan to their implemented locations, run full gates, update logs.

**Files:**

- Move: `reinix/docs/specs/mvp-workflow-runner.md` → `reinix/docs/specs/implemented/mvp-workflow-runner.md` (only if not already moved).
- Move: `reinix/docs/plans/adr-007-cli-settings-convention-closure.md` → `reinix/docs/plans/implemented/adr-007-cli-settings-convention-closure.md`.
- Modify: `reinix/docs/log.md`.

**Key Work Items:**

- [x] Run the full gates and confirm green.
- [x] Move plan and (if not already) spec to `implemented/`.
- [x] Append a single closeout line to `reinix/docs/log.md` summarizing the closure.

**Validation:**

```bash
./scripts/run_silent.sh "tests" npm test
./scripts/run_silent.sh "build" npx tsc --noEmit
```

**Completion Signal:** All adr-007 violations closed; spec and plan archived; gates green.

**Commit:**

```bash
git add reinix/docs
git commit -m "reinix: close adr-007 closure plan"
```
