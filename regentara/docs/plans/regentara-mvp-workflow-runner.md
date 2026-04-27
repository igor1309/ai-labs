---
date: 2026-04-27
model: gpt-5
description: "Implementation plan: Regentara MVP workflow runner from accepted specs and ADRs"
---

# Regentara MVP Workflow Runner Implementation Plan

> **For agentic workers:** REQUIRED: Follow this plan task-by-task. Use `dev-skills/public/strict-tdd` and `dev-skills/public/process-gates` for every code, config, CI, dependency, release, or generated-artifact change. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Regentara MVP workflow runner described by `regentara/docs/specs/mvp-workflow-runner.md`, preserving the accepted ADR invariants for settings, model routing, provider CLI boundaries, run artifacts, fail-fast behavior, and the `ReviewFixPolicy` seam.

**Architecture:** Build Regentara as a Node.js ESM workspace package under `regentara/`, following the existing root Node test/build gates. Keep the Orchestrator as the sequencing client that owns `ReviewFixPolicy`, with settings resolution, model routing, provider CLI execution, run storage, artifact mutation rules, and runtime output validation in focused modules that can be tested independently.

**Tech Stack:** Node.js >= 20.x, Node.js ESM, `node:test`, `node:assert/strict`, `node:fs/promises`, `node:child_process`, `js-yaml`, `ajv`, root npm workspace tooling.

---

## Source Documents

- `regentara/docs/specs/mvp-workflow-runner.md`
- `regentara/docs/adr/adr-001-agent-settings.md`
- `regentara/docs/adr/adr-002-model-routing.md`
- `regentara/docs/adr/adr-003-cli-execution-boundary.md`
- `regentara/docs/adr/adr-004-run-artifact-storage-and-mutation-policy.md`
- `regentara/docs/adr/adr-005-failure-policy.md`
- `regentara/docs/adr/adr-006-review-fix-policy-seam.md`
- `regentara/docs/regentara-orchestration.md`
- Process updates from `63a14b3ad256f1728d5b4766df8d13c406fd1436`

## Execution Mode

Mode: auto-continue
Human review between tasks: no
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption
Push policy: no push until final closeout unless the user explicitly asks

In `auto-continue` mode, RED does not require a human stop. Each RED must still compile, run, and fail with an assertion that expresses the missing behavior before GREEN starts.

## Execution Lock

Worktree mode: create new
Expected worktree: `worktrees/regentara-mvp-workflow-runner`
Expected branch: `codex/regentara-mvp-workflow-runner`
Preflight check: [x] done

Step 0:

```bash
git worktree add worktrees/regentara-mvp-workflow-runner -b codex/regentara-mvp-workflow-runner trunk
```

Before Step 1:

1. Run `git worktree list --porcelain`.
2. Run `git branch --show-current`.
3. Confirm the worktree is `worktrees/regentara-mvp-workflow-runner` and the branch is `codex/regentara-mvp-workflow-runner`.
4. Emit `Preflight: worktree=<path>, branch=<branch>, separate_worktree=<pass|fail>`.
5. If preflight fails, halt before editing files.

## Scope Guardrails

- Do not implement direct provider APIs.
- Do not manage provider credentials, authentication state, provider sessions, sandboxing, permissions, or CLI installation.
- Do not create, clean up, or manage worktrees, branches, commits, pull requests, builds, tests, formatting, or dependency installation from Regentara runtime code.
- Do not add retries, automatic subprocess timeouts, process-group handling, graceful termination, force-kill behavior, or cleanup behavior.
- Do not introduce custom agent identifiers, custom model route keys, schema versioning, XDG paths, TOML settings, per-agent settings files, `agents.d`, or plugin-defined agents.
- Do not define a final artifact taxonomy, iteration folder layout, retention policy, observability schema, or detailed session trace model.
- Do not inspect, mutate, or persist `ReviewFixPolicy` session contents inside the Orchestrator.
- Keep commits scoped to the active task, with the project log updated in the same task when the change is meaningful.

## ADR Traceability Matrix

| ADR | Invariant | Establishing Tasks |
|---|---|---|
| ADR-001 Agent Settings | local-then-global `agents.yaml`, no merge/fallback, known agent inventory, required fields, prompt/output validation, runtime JSON Schema validation | Tasks 2, 5 |
| ADR-002 Model Routing | local-then-global `models.yaml`, exact route keys, provider/runner/model validation, supported combinations only | Task 3 |
| ADR-003 CLI Execution Boundary | required CLI availability before run creation, headless subprocesses, invocation cwd, non-zero exit is failure, no Git/build/test/runtime management | Tasks 4, 5 |
| ADR-004 Run Artifacts | global `~/.regentara/runs/<run-id>/`, UTC run ID, immutable authored artifacts, limited mutable metadata | Task 4 |
| ADR-005 Failure Policy | startup failures create no run, runtime failures fail fast, preserve existing artifacts, no retries, no timeout, interruption semantics | Tasks 4, 6, 8 |
| ADR-006 ReviewFixPolicy Seam | injected policy owned by Orchestrator module, exactly one policy instance, one decision per review, opaque session threading, no verdict adjudication in Orchestrator | Task 7 |

## Target File Map

Create:

- `regentara/package.json` — workspace package metadata, version, CLI bin, direct dependencies.
- `regentara/README.md` — concise package usage and boundaries.
- `regentara/src/index.js` — CLI entrypoint that parses MVP inputs and calls composition.
- `regentara/src/composition.js` — production wiring for settings, routing, provider executor, run store, and policy.
- `regentara/src/orchestrator.js` — `runWorkflow` implementation and `ReviewFixPolicy` protocol surface.
- `regentara/src/settings/agent-settings.js` — `agents.yaml` discovery, parsing, and validation.
- `regentara/src/settings/model-routing.js` — `models.yaml` discovery, parsing, and validation.
- `regentara/src/settings/paths.js` — local/global settings path helpers.
- `regentara/src/provider-cli-availability.js` — provider CLI availability checks before run creation.
- `regentara/src/provider-cli-executor.js` — headless provider CLI subprocess boundary.
- `regentara/src/runtime-output.js` — JSON parsing and JSON Schema validation.
- `regentara/src/run-store.js` — run ID generation, run directory creation, and run metadata mutations.
- `regentara/src/artifact-store.js` — authored artifact creation and overwrite rejection.
- `regentara/src/errors.js` — startup/runtime failure types and concise failure messages.
- `regentara/tests/*.test.js` — unit tests grouped by public behavior.
- `regentara/tests/helpers/*.js` — test factories, temporary home/cwd helpers, spies, and fake provider executors.
- `.github/workflows/regentara-core.yml` — per-project CI workflow.

Modify:

- `package.json` — add `regentara` workspace and root test glob.
- `package-lock.json` — add Regentara workspace and direct dependencies.
- `README.md` — add Regentara to `## Components`.
- `release-units.config.toml` — add `regentara` as a release unit.
- `release-units.toml` — regenerate after adding `regentara` to release discovery.
- `.github/workflows/ci.yml` — add Regentara path filter, job, report dependency, and notification dependency.
- `regentara/docs/log.md` — record meaningful implementation progress.
- `regentara/docs/plans/regentara-mvp-workflow-runner.md` — update checkboxes only after verified evidence.

Do not modify `scripts/loc-dashboard.sh` unless implementation creates a new top-level project directory. `regentara` is already present in its row list, project loop, and known list.

## Testing Discipline

- One behavior at a time.
- Compilation/module-resolution failures are not RED.
- If a new test needs an export that does not exist, first add the smallest compiling skeleton and commit it in the scaffold task.
- A valid RED must run and fail with an assertion that states the missing behavior.
- GREEN must contain only the minimal code required by that RED.
- After each GREEN, run the targeted test command and the relevant full Regentara test command.
- Refactor only on green. Run tests after each refactor.
- Commit after green gates. Do not include TDD-process text in commit messages.
- Use test helpers for temporary files, fake home directories, fake provider executors, and spies.

## Verification Commands

Targeted Regentara tests:

```bash
./scripts/run_silent.sh "regentara-tests" node --test regentara/tests/*.test.js
```

Full Node/TypeScript gates required before closeout:

```bash
./scripts/run_silent.sh "tests" npm test
./scripts/run_silent.sh "build" npx tsc --noEmit
```

Release/config/CI gates when release metadata or workflows change:

```bash
node scripts/release/generate-manifest.js --check
node scripts/release/validate-manifest.js
```

Regentara is a release unit in the MVP. After adding `regentara` to `release-units.config.toml`, regenerate `release-units.toml`, then run the release checks above.

## Task 1: Scaffold Regentara Workspace Package

**Objective:** Create a compiling package, test harness, CLI placeholder, and CI/release wiring so later RED tests can fail by assertion instead of module-resolution errors.

**Files:**

- Create: `regentara/package.json`
- Create: `regentara/README.md`
- Create: `regentara/src/index.js`
- Create: `regentara/src/composition.js`
- Create: `regentara/src/orchestrator.js`
- Create: `regentara/src/settings/agent-settings.js`
- Create: `regentara/src/settings/model-routing.js`
- Create: `regentara/src/settings/paths.js`
- Create: `regentara/src/provider-cli-availability.js`
- Create: `regentara/src/provider-cli-executor.js`
- Create: `regentara/src/runtime-output.js`
- Create: `regentara/src/run-store.js`
- Create: `regentara/src/artifact-store.js`
- Create: `regentara/src/errors.js`
- Create: `regentara/tests/smoke.test.js`
- Create: `.github/workflows/regentara-core.yml`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Modify: `release-units.config.toml`
- Modify: `release-units.toml`
- Modify: `.github/workflows/ci.yml`
- Modify: `regentara/docs/log.md`

**Key Work Items:**

- [x] Verify current Node/npm versions and dependency state with `node --version`, `npm --version`, and `npm ls js-yaml ajv`.
- [x] Add `regentara/package.json` with `"type": "module"`, `"version": "0.0.1"`, `"engines": { "node": ">=20" }`, a `bin` entry, and direct dependencies on `js-yaml` and `ajv`.
- [x] Run `npm install` to update the root lockfile.
- [x] Inspect installed APIs before implementation: `node -e "import yaml from 'js-yaml'; import Ajv from 'ajv'; console.log(typeof yaml.load, typeof Ajv)"`.
- [x] Add minimal exported skeletons for all public modules. Skeletons must compile but return deliberately incomplete results such as `{ status: "failed", exitCode: 1, failureReason: "not implemented" }`.
- [x] Add `regentara/tests/smoke.test.js` with one assertion that the package exports `runWorkflow`.
- [x] Add `regentara` to the root workspace list and root `npm test` glob.
- [x] Add Regentara to the root `README.md` Components table as a product or CLI release unit.
- [x] Add `regentara` to `release-units.config.toml` and regenerate `release-units.toml`.
- [x] Add `.github/workflows/regentara-core.yml`, modeled on `corpus-scout-core.yml` without unrelated dependencies.
- [x] Wire `regentara` path filters and jobs into `.github/workflows/ci.yml`.
- [x] Update `regentara/docs/log.md`.

**Validation:**

```bash
./scripts/run_silent.sh "regentara-smoke" node --test regentara/tests/smoke.test.js
./scripts/run_silent.sh "regentara-tests" node --test regentara/tests/*.test.js
./scripts/run_silent.sh "tests" npm test
./scripts/run_silent.sh "build" npx tsc --noEmit
node scripts/release/generate-manifest.js --check
node scripts/release/validate-manifest.js
```

**Completion Signal:** Regentara is a workspace package with compiling public skeletons, package metadata, CI routing, release metadata, and a passing smoke test.

**Commit:**

```bash
git add .github/workflows/ci.yml .github/workflows/regentara-core.yml README.md package.json package-lock.json release-units.config.toml release-units.toml regentara/package.json regentara/README.md regentara/src regentara/tests regentara/docs/log.md regentara/docs/plans/regentara-mvp-workflow-runner.md
git commit -m "scaffold regentara workspace package"
```

## Task 2: Agent Settings Resolution and Validation

**Objective:** Implement `resolveAgentSettings(workingDirectory)` for ADR-001 and spec tests 1-12.

**Files:**

- Modify: `regentara/src/settings/agent-settings.js`
- Modify: `regentara/src/settings/paths.js`
- Modify: `regentara/src/errors.js`
- Create: `regentara/tests/agent-settings.test.js`
- Create/modify: `regentara/tests/helpers/settings.js`
- Modify: `regentara/docs/log.md`

**Key Work Items:**

- [x] Add a helper that creates isolated temporary working directories and fake home directories without touching the real `~/.regentara`.
- [x] For each spec test 1-12, repeat: write one failing assertion test, run targeted RED, implement the minimum GREEN, run targeted tests, run full Regentara tests, refactor on green, commit.
- [x] Enforce local `./.regentara/agents.yaml` before global `~/.regentara/agents.yaml`.
- [x] Enforce no merge and no fallback when a local file exists but is invalid.
- [x] Validate exactly the MVP agent identifiers: `producer`, `reviewer`, `remediator`.
- [x] Reject unknown identifiers and missing required agents.
- [x] Validate required fields `model`, `prompt`, and `output`.
- [x] Treat `name` as display-only metadata.
- [x] Support only explicit MVP prompt forms and JSON Schema output references/inline schemas chosen in this task. Document the chosen forms in `regentara/README.md`.

**Validation:**

```bash
./scripts/run_silent.sh "agent-settings-tests" node --test regentara/tests/agent-settings.test.js
./scripts/run_silent.sh "regentara-tests" node --test regentara/tests/*.test.js
```

**Completion Signal:** Spec tests 1-12 pass; startup settings failures are represented as `StartupValidationFailure` values and do not create runs.

**Commit:**

```bash
git add regentara/src/settings/agent-settings.js regentara/src/settings/paths.js regentara/src/errors.js regentara/tests regentara/README.md regentara/docs/log.md regentara/docs/plans/regentara-mvp-workflow-runner.md
git commit -m "validate regentara agent settings"
```

## Task 3: Model Routing Resolution and Validation

**Objective:** Implement `resolveModelRouting(workingDirectory)` for ADR-002 and spec tests 13-21.

**Files:**

- Modify: `regentara/src/settings/model-routing.js`
- Modify: `regentara/src/settings/paths.js`
- Modify: `regentara/src/errors.js`
- Create: `regentara/tests/model-routing.test.js`
- Modify: `regentara/tests/helpers/settings.js`
- Modify: `regentara/docs/log.md`

**Key Work Items:**

- [x] For each spec test 13-21, repeat the RED-GREEN-REFACTOR loop with assertion-failing RED evidence.
- [x] Resolve local `./.regentara/models.yaml` before global `~/.regentara/models.yaml`.
- [x] Reject invalid local models without global fallback.
- [x] Enforce exactly the supported route keys: `sonnet`, `opus`, `gpt`, `codex`.
- [x] Reject unknown route keys and missing route keys.
- [x] Validate `provider`, `runner`, and `model`.
- [x] Support only `openai/codex` and `anthropic/claude-code`.

**Validation:**

```bash
./scripts/run_silent.sh "model-routing-tests" node --test regentara/tests/model-routing.test.js
./scripts/run_silent.sh "regentara-tests" node --test regentara/tests/*.test.js
```

**Completion Signal:** Spec tests 13-21 pass and workflow code can depend only on validated routing values.

**Commit:**

```bash
git add regentara/src/settings/model-routing.js regentara/src/settings/paths.js regentara/src/errors.js regentara/tests regentara/docs/log.md regentara/docs/plans/regentara-mvp-workflow-runner.md
git commit -m "validate regentara model routing"
```

## Task 4: Startup Validation, Run Creation, and Artifact Mutation Rules

**Objective:** Create runs only after startup validation passes and enforce ADR-004 run/artifact invariants for spec tests 22-24 and 44-47.

**Files:**

- Modify: `regentara/src/run-store.js`
- Modify: `regentara/src/artifact-store.js`
- Modify: `regentara/src/provider-cli-availability.js`
- Modify: `regentara/src/orchestrator.js`
- Create: `regentara/tests/run-store.test.js`
- Create: `regentara/tests/artifact-store.test.js`
- Create: `regentara/tests/startup-validation.test.js`
- Modify: `regentara/tests/helpers/*.js`
- Modify: `regentara/docs/log.md`

**Key Work Items:**

- [x] Implement injectable clock and random-byte providers for deterministic run ID tests.
- [x] Write RED/GREEN tests for run ID format and global run directory creation.
- [x] Validate required provider CLI availability before run creation.
- [x] Ensure missing provider CLI causes startup failure with no run directory.
- [x] Implement authored artifact creation that rejects overwrite/rewrite attempts.
- [x] Implement metadata updates limited to end time, status, and final exit code.
- [x] Reject metadata mutation for any other field.
- [x] Keep execution progress out of authored artifact mutation.

**Validation:**

```bash
./scripts/run_silent.sh "run-store-tests" node --test regentara/tests/run-store.test.js
./scripts/run_silent.sh "artifact-store-tests" node --test regentara/tests/artifact-store.test.js
./scripts/run_silent.sh "startup-validation-tests" node --test regentara/tests/startup-validation.test.js
./scripts/run_silent.sh "regentara-tests" node --test regentara/tests/*.test.js
```

**Completion Signal:** Spec tests 22-24 and 44-47 pass; startup validation failures return non-zero results without run creation.

**Commit:**

```bash
git add regentara/src/run-store.js regentara/src/artifact-store.js regentara/src/provider-cli-availability.js regentara/src/orchestrator.js regentara/tests regentara/docs/log.md regentara/docs/plans/regentara-mvp-workflow-runner.md
git commit -m "create validated regentara runs"
```

## Task 5: Provider CLI Execution Boundary

**Objective:** Implement `executeProviderCli(input)` for ADR-003 and spec tests 25-27 and 54.

**Files:**

- Modify: `regentara/src/provider-cli-executor.js`
- Modify: `regentara/src/errors.js`
- Create: `regentara/tests/provider-cli-executor.test.js`
- Modify: `regentara/tests/helpers/*.js`
- Modify: `regentara/docs/log.md`

**Key Work Items:**

- [x] Write RED/GREEN tests proving provider CLIs are invoked from the Regentara invocation `workingDirectory`.
- [x] Capture exit status, stdout/stderr references or summaries, runner references, provider session references, and parsed JSON output when available.
- [x] Treat non-zero exit status as runtime failure.
- [x] Prove Regentara does not infer success from partial files or logs when the subprocess exits non-zero.
- [x] Prove no automatic subprocess timeout is configured in the MVP executor.
- [x] Keep runtime code free of direct build, test, format, dependency install, Git, branch, commit, PR, worktree, cleanup, sandbox, or permission-management commands.

**Validation:**

```bash
./scripts/run_silent.sh "provider-cli-tests" node --test regentara/tests/provider-cli-executor.test.js
./scripts/run_silent.sh "regentara-tests" node --test regentara/tests/*.test.js
```

**Completion Signal:** Spec tests 25-27 and 54 pass with a subprocess boundary that observes exit status as source of truth.

**Commit:**

```bash
git add regentara/src/provider-cli-executor.js regentara/src/errors.js regentara/tests regentara/docs/log.md regentara/docs/plans/regentara-mvp-workflow-runner.md
git commit -m "enforce regentara provider cli boundary"
```

## Task 6: Runtime Output Validation

**Objective:** Parse and validate every agent runtime output before it reaches the next workflow step, satisfying spec tests 28-30.

**Files:**

- Modify: `regentara/src/runtime-output.js`
- Modify: `regentara/src/orchestrator.js`
- Create: `regentara/tests/runtime-output.test.js`
- Modify: `regentara/tests/helpers/*.js`
- Modify: `regentara/docs/log.md`

**Key Work Items:**

- [x] Write RED/GREEN tests for invalid JSON runtime output.
- [x] Write RED/GREEN tests for schema-invalid runtime JSON.
- [x] Write RED/GREEN tests proving invalid output is not passed to the next workflow step.
- [x] Use the JSON Schema configured for the executed agent from `agents.yaml`.
- [x] Return runtime failures with concise failure reasons.

**Validation:**

```bash
./scripts/run_silent.sh "runtime-output-tests" node --test regentara/tests/runtime-output.test.js
./scripts/run_silent.sh "regentara-tests" node --test regentara/tests/*.test.js
```

**Completion Signal:** Spec tests 28-30 pass and the Orchestrator cannot consume invalid agent output.

**Commit:**

```bash
git add regentara/src/runtime-output.js regentara/src/orchestrator.js regentara/tests regentara/docs/log.md regentara/docs/plans/regentara-mvp-workflow-runner.md
git commit -m "validate regentara runtime output"
```

## Task 7: Workflow Sequence and ReviewFixPolicy Seam

**Objective:** Implement the Producer → Reviewer → policy → optional Remediator loop, satisfying spec tests 31-43 and ADR-006.

**Files:**

- Modify: `regentara/src/orchestrator.js`
- Modify: `regentara/src/composition.js`
- Create: `regentara/tests/orchestrator-sequence.test.js`
- Create: `regentara/tests/review-fix-policy.test.js`
- Modify: `regentara/tests/helpers/*.js`
- Modify: `regentara/docs/log.md`

**Key Work Items:**

- [x] Define `ReviewFixPolicy` in the Orchestrator module because the Orchestrator is its client.
- [x] Require exactly one injected policy before a run can start.
- [x] Write RED/GREEN tests for producer-first behavior.
- [x] Write RED/GREEN tests for reviewer input after producer succeeds.
- [x] Write RED/GREEN tests proving no subsequent agent runs before policy decision.
- [x] Write RED/GREEN tests for `complete-ok`, `complete-fail`, and `remediate` decisions.
- [x] Write RED/GREEN tests proving Remediator receives task, work/artifact references, and verdict.
- [x] Write RED/GREEN tests proving producer receives the remediated valid task.
- [x] Write RED/GREEN tests proving policy is called exactly once per completed review.
- [x] Write RED/GREEN tests proving returned policy session is forwarded unchanged.
- [x] Write RED/GREEN tests proving the Orchestrator does not branch on verdict severity or finding category.
- [x] Keep Producer, Reviewer, and Remediator as peer calls; do not let them invoke each other or the Orchestrator.

**Validation:**

```bash
./scripts/run_silent.sh "orchestrator-sequence-tests" node --test regentara/tests/orchestrator-sequence.test.js
./scripts/run_silent.sh "review-fix-policy-tests" node --test regentara/tests/review-fix-policy.test.js
./scripts/run_silent.sh "regentara-tests" node --test regentara/tests/*.test.js
```

**Completion Signal:** Spec tests 31-43 pass and all post-review routing decisions flow through the injected policy.

**Commit:**

```bash
git add regentara/src/orchestrator.js regentara/src/composition.js regentara/tests regentara/docs/log.md regentara/docs/plans/regentara-mvp-workflow-runner.md
git commit -m "sequence regentara workflow through review policy"
```

## Task 8: Fail-Fast Runtime Failure and Interruption Behavior

**Objective:** Implement ADR-005 runtime failure behavior and spec tests 48-53 and 55-56.

**Files:**

- Modify: `regentara/src/orchestrator.js`
- Modify: `regentara/src/run-store.js`
- Modify: `regentara/src/errors.js`
- Create: `regentara/tests/failure-policy.test.js`
- Modify: `regentara/tests/helpers/*.js`
- Modify: `regentara/docs/log.md`

**Key Work Items:**

- [x] Write RED/GREEN tests proving already-created artifacts are preserved after runtime failure.
- [x] Write RED/GREEN tests proving missing expected artifacts are not fabricated and fail the run.
- [x] Write RED/GREEN tests proving execution stops after the first runtime failure.
- [x] Write RED/GREEN tests proving failed steps are not retried.
- [x] Write RED/GREEN tests proving later workflow steps do not run after failure.
- [x] Write RED/GREEN tests proving interruption before workflow start exits non-zero and creates no run.
- [x] Write RED/GREEN tests proving interruption after workflow start marks the run failed.
- [x] Ensure failed runs return non-zero exit codes and concise failure reasons.

**Validation:**

```bash
./scripts/run_silent.sh "failure-policy-tests" node --test regentara/tests/failure-policy.test.js
./scripts/run_silent.sh "regentara-tests" node --test regentara/tests/*.test.js
```

**Completion Signal:** Spec tests 48-53 and 55-56 pass with clean startup-vs-runtime failure separation.

**Commit:**

```bash
git add regentara/src/orchestrator.js regentara/src/run-store.js regentara/src/errors.js regentara/tests regentara/docs/log.md regentara/docs/plans/regentara-mvp-workflow-runner.md
git commit -m "fail fast in regentara workflow runs"
```

## Task 9: CLI Entrypoint and Composition Closeout

**Objective:** Wire the package CLI to production composition without adding runtime responsibilities forbidden by ADR-003.

**Files:**

- Modify: `regentara/src/index.js`
- Modify: `regentara/src/composition.js`
- Modify: `regentara/README.md`
- Create: `regentara/tests/cli.test.js`
- Modify: `regentara/tests/helpers/*.js`
- Modify: `regentara/docs/log.md`

**Key Work Items:**

- [x] Add tests for concise startup-validation failure output and non-zero exit behavior.
- [x] Add tests for successful composition using injected fakes where provider CLIs are not actually invoked.
- [x] Keep real provider credentials and sessions outside Regentara.
- [x] Document supported MVP settings file shapes and runner boundaries in `regentara/README.md`.
- [x] Confirm CLI code does not run build, test, format, Git, branch, commit, PR, worktree, cleanup, sandbox, or permission-management commands.

**Validation:**

```bash
./scripts/run_silent.sh "cli-tests" node --test regentara/tests/cli.test.js
./scripts/run_silent.sh "regentara-tests" node --test regentara/tests/*.test.js
./scripts/run_silent.sh "tests" npm test
./scripts/run_silent.sh "build" npx tsc --noEmit
```

**Completion Signal:** The public CLI path calls the tested composition and preserves the MVP boundaries.

**Commit:**

```bash
git add regentara/src/index.js regentara/src/composition.js regentara/README.md regentara/tests regentara/docs/log.md regentara/docs/plans/regentara-mvp-workflow-runner.md
git commit -m "wire regentara cli composition"
```

## Final Closeout

Final gates:

```bash
./scripts/run_silent.sh "tests" npm test
./scripts/run_silent.sh "build" npx tsc --noEmit
node scripts/release/generate-manifest.js --check
node scripts/release/validate-manifest.js
git status --short
```

Archive plan: move to `regentara/docs/plans/implemented/regentara-mvp-workflow-runner.md`
Commit archive move: yes
Push/PR: follow push policy; create a PR only when the user asks or the active branch is ready for review

Closeout steps:

- [ ] Confirm every spec test 1-56 is represented by a passing test.
- [ ] Confirm ADR traceability matrix remains accurate.
- [ ] Confirm `README.md` Components table is current.
- [ ] Confirm `release-units.config.toml` and `release-units.toml` include Regentara and are aligned.
- [ ] Confirm `.github/workflows/ci.yml` includes Regentara in changes, report, and notifications.
- [ ] Confirm `regentara/docs/log.md` has a concise outcome-focused entry.
- [ ] Move this plan to `regentara/docs/plans/implemented/`.
- [ ] Commit the archive move.

## Done Criteria

- All phases above are implemented and locally committed.
- All required tests from `regentara/docs/specs/mvp-workflow-runner.md` pass.
- Startup validation creates no run on settings or provider CLI availability failure.
- Successful startup creates a valid run ID and run directory under `~/.regentara/runs/<run-id>/`.
- Provider CLI execution obeys the MVP invocation and capture boundary.
- Runtime output validation prevents invalid agent output from reaching later steps.
- The Orchestrator delegates every post-review routing decision to injected `ReviewFixPolicy`.
- Runtime failures stop immediately, preserve existing artifacts, mark the run failed, and return non-zero.
- Authored artifacts are immutable after creation; run metadata mutations are limited to end time, status, and final exit code.
- Root Node/TypeScript verification passes.
- The implementation plan has been moved to `regentara/docs/plans/implemented/` as the final closeout step.
