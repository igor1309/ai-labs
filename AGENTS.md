# AGENTS

## Collaboration preferences

- Latest direct user instruction is the highest-priority source of truth for current scope.
- If the user narrows scope or corrects direction, immediately stop the previous plan and follow the new scope.
- Before making changes, restate the requested scope in one sentence and execute only that scope.
- Follow the written plan/docs as the source of truth; do not invent steps or rename phases.
- Make small, reviewable changes and stop after each step for review.
- Add tests alongside changes, not later.
- Always run tests on code changes.
- Require a full test suite pass before declaring completion.
- Require a full test suite pass for each phase step before moving to the next step.
- Commit only when tests are passing for the current branch state.
- Protocols are owned by their client and MUST live in the same module. A protocol without its client is a violation.
- Keep scope minimal and explicit; avoid scope creep.
- Tests must cover reasonable edge cases for new or changed behavior.
- Versioning: bump only the packages with code changes, keep `package.json` and `package-lock.json` root versions aligned, and update lockfile entries when package versions change.

## Specs

Specs define a component's contract before implementation. They live at `<project>/docs/specs/<name>.md` and move to `<project>/docs/specs/implemented/` after implementation.

Required sections:
- **Goal**: one sentence — what the component does and who owns it.
- **Public interface**: function signatures, input/output shapes.
- **Behavior rules**: validation, error handling, edge cases — concrete and testable.
- **Tests (required)**: enumerated test cases that cover the behavior rules.
- **Done criteria**: what "finished" means — typically interface + tests.

Specs must not contain architecture preamble, future speculation, or implementation details. They describe *what* and *when it fails*, not *how*.

## Log

- Log entries are in reverse chronological order (newest first).
- Update the relevant log for each meaningful change set before pushing:
  - repo-level changes: `docs/log.md`
  - project-level changes: `<project>/docs/log.md` (for example, `oracle/docs/log.md`)
  - if both scopes are changed, update both logs
- Keep log entries concise and outcome-focused; don’t copy commit messages verbatim.

## Strict TDD mode

Trigger strict TDD mode when the user explicitly asks for TDD, RED/GREEN, or equivalent.

- One test at a time.
- RED first: add or update one test, run tests, and get a failing assertion for the missing behavior.
- Compilation errors are not RED.
- During RED, production code changes are forbidden.
- Stop after RED and wait for explicit user approval to continue to GREEN, unless the user explicitly asks to auto-continue.
- GREEN means minimum production code only for the current failing test.
- Do not add extra behavior, scaffolding, defaults, or refactors in GREEN unless required by the failing test.
- Run tests via `./scripts/run_silent.sh "tests" npm test`.

## No-Junk Scope Lock

Do not add anything not required by current scope or the current failing test.

- No new modules or packages unless explicitly requested.
- No default or fallback dependencies unless explicitly requested.
- No placeholder behavior that is not demanded by tests.
- No side docs or log updates for micro-steps.
- If a change does not directly turn current RED into GREEN, do not add it.

## Pre-Commit Scope Check

Before each commit:

1. Verify every changed file is directly tied to the current step.
2. Verify no out-of-scope files were added.
3. Run `./scripts/run_silent.sh "tests" npm test`.

## Step closeout protocol

Mandatory after each implementation step:

1. Self-review the step against the approved spec and implementation plan scope.
2. Fix any issues found in the self-review.
3. Run the full test suite and fix failures until it passes.
4. Summarize what changed and why.
5. Commit only files related to the current step.
6. Update plan tracker checkboxes only for gates with verified evidence (successful command/check output).
7. Push the branch to `origin` unless explicitly instructed not to push.
8. Stop and wait for review approval before starting the next step.

## Implementation Preflight Gate (Blocking)

Before any implementation action (editing files, running implementation tests, or committing), run and report preflight:

1. Confirm whether the active plan requires a separate worktree/branch.
2. Verify with git commands (minimum): `git worktree list --porcelain` and `git branch --show-current`.
3. Capture current worktree path and branch.
4. Emit a preflight status line:
   - `Preflight: worktree=<path>, branch=<branch>, separate_worktree=<pass|fail>`
   - `separate_worktree=pass` means the current worktree is a newly created, non-root worktree (typically under `worktrees/<slug>`) and the branch is the dedicated work branch (typically `codex/<slug>`).
5. If separate worktree is required and preflight is `fail`, create a new separate worktree and rerun preflight until it is `pass` (do not implement from the root worktree). Example: `git worktree add -b codex/<slug> worktrees/<slug> trunk`
6. If any preflight item fails, no file edits are allowed.

## Process Discipline Hard Gates

- Execution lock is mandatory, never advisory.
- If a plan requires a separate worktree/branch, no edits may start before preflight passes.
- User scope changes do not implicitly waive plan locks.
- If a requested action would violate a plan lock, ask one explicit override question first and proceed only after confirmation.
- Commit is forbidden while any mandatory plan gate is incomplete, unless the user explicitly approves overriding that gate.
- Immediately before commit, list gate status (`passed` or `not passed`) for required preflight, tests, build, step closeout, and plan-tracker updates.
- Do not claim completion ("done", "in full", "completed") unless all mandatory gates have passed.
- If blocked by environment (tooling, network, permissions), report blocked status and list exact unmet gates.
- If the agent detects it already violated a lock, report that violation immediately before any further action.

## Plan Creation Lock

When creating implementation plans (especially from review findings), the plan must include an explicit execution lock:

1. Include explicit preflight fields:
   - `Worktree required: yes/no`
   - `Expected worktree: <path or pattern>`
   - `Expected branch: <name or pattern>`
   - `Preflight check: [ ] done`
2. Start from a new separate git worktree with a dedicated branch when required by the plan.
3. Require preflight verification before Step 1; if preflight fails, halt immediately.
4. Execute one step at a time with a green gate per step.
5. For each step, run required targeted tests and full suite `./scripts/run_silent.sh "tests" npm test`.
6. Proceed only if green; if tests fail, fix first and re-run until green.
7. Commit step changes only after green.
8. Self-review immediately after each step commit; fix any fail/warning findings immediately, re-test, and commit fixes.
9. Mark implemented step status in the plan and commit the plan status update.
10. Repeat the same process for each next step.
11. At completion, run final gates: `./scripts/run_silent.sh "build" npx tsc --noEmit` and `./scripts/run_silent.sh "tests" npm test`.
12. Move completed plan from `docs/plans/` to `docs/plans/implemented/` (or `<project>/docs/plans/` → `<project>/docs/plans/implemented/` for project-scoped plans), commit the move, and create a PR.

## Release Process

Release policy is outcome-based, per-unit, and governed by ADR-000 through ADR-006 (`docs/adr/release/`). Commands are implementation detail; these invariants are mandatory.

### Per-unit release model

- **Release units** are independently versioned and released. Units are declared in `release-units.config.toml` and tracked in the committed manifest `release-units.toml`.
- **Discovery**: `release-units.config.toml` lists directory prefixes eligible for release-unit discovery. The generator (`scripts/release/generate-manifest.js`) produces the committed manifest. CI fails if the manifest drifts.
- **Canonical version**: Node units use `package.json`; non-Node units use `release.toml`. A unit MUST NOT contain both. Versions follow semver.
- **Tagging**: per-unit tags follow `<basename>_v<version>` (e.g., `nomos_v0.6.0`). Basename is the leaf directory name, must be globally unique, and must not contain underscores.
- **Release detection**: a release occurs only when **both** files under the unit root changed **and** the canonical version changed since the last matching tag (`<basename>_v*`). No tag → base is the initial commit.
- **Trunk-only**: releases trigger only on push to `trunk`. Release branches are prohibited.
- **Docker units**: Docker-producing units (marked in manifest) define two image tags: `<version>` and `<git-sha>`. Registry publishing is deferred; images are built and tagged locally on the VPS.

### Release invariants

- **Start state**: release from `trunk`.
- **SemVer decision**: choose release bump per SemVer 2.0 from the delta since the previous unit tag (or full history on first release).
- **Release notes**: add exactly one new top entry in the release-scope log (`docs/log.md` for repo-level releases, `<project>/docs/log.md` for project releases) at the top of the current date section, if present, scoped to that reviewed delta.
- **Version consistency**: canonical version in the unit's metadata file and the release tag `<basename>_v<version>` must match.
- **Push safety**: push only `trunk` and the explicit release tag; never `git push --tags`.
- **Pre-push gate**: run BOTH `./scripts/run_silent.sh "build" npx tsc --noEmit` AND `./scripts/run_silent.sh "tests" npm test` before tagging.
- **Deployment gate**: releases deploy via CI on tag push after tests pass.
- **Post-push verification**: after pushing the tag, watch the Release Unit workflow with `gh run list` or `gh run watch`. Confirm CI and release-unit jobs pass before declaring the release complete.
- **CI trigger**: `.github/workflows/release-unit.yml` is a post-tag pipeline that verifies, tests, and deploys. Release detection (`detect-releases.js`) and tag creation (`create-tags.js`) are operator-run scripts.
- **Legacy coexistence**: the existing `v*` tag namespace (`.github/workflows/release.yml`, Oracle-specific) coexists with the new `<basename>_v*` namespace. The legacy workflow is not modified; migration is deferred.
- **Smoke model**: the real-provider smoke gate uses `vars.OPENROUTER_CI_MODEL` and `secrets.OPENROUTER_API_KEY`.

## ADR Governance

Architecture Decision Records (ADRs) live in `docs/adr/` organized by domain (e.g., `docs/adr/release/`, `docs/adr/governance/`).

- ADR structure follows the template in `docs/adr/governance/adr-structure-template.md` (6-section progressive disclosure: Executive Summary, Context, Decision, Rules/Invariants, Consequences, Non-Goals).
- ADR review follows the standard in `docs/adr/governance/adr-review-standard.md` (4 dimensions: Intent Integrity, Boundary Clarity, Cross-ADR Consistency, Decision Stability).
- Implementation plans derived from ADRs must include an ADR Traceability Matrix mapping each invariant to its implementation phase.
- Planner requirements for ADR-based plans are defined in `docs/adr/governance/implementation-plan-planner-requirements.md`.

## "protocol owned by client" rule

- The client defines and owns the dependency shape (protocol/interface/data model).
- A protocol MUST live in the same module as its client. Separating them is a violation.
- If the client is public, its protocol must be public so composition can supply an implementation.
- Composition layer(s) adapts concrete implementations to client-owned protocols.
- Modules MUST NOT know about CLI or each other.

## Per-Project CI Isolation

When adding a new project with its own dependencies, create a dedicated `<project>-core.yml` CI workflow. Do not modify another project's workflow to install cross-project deps or run cross-project tests.

- Each `<project>-core.yml` installs only its own deps and runs only its own test glob.
- `ci.yml` dispatches to per-project workflows based on path-filter change detection; together the per-project workflows cover all tests from all projects.
- The release pipeline (`release.yml`) installs all deps, runs the full `npm test` suite, and adds e2e tests on top.
- When a new project causes failures in repo-wide tests (e.g. label compliance scanning all compose files), the fix is legitimate but must be called out explicitly as a cross-project integration concern — not silently bundled into the project's commit.

## Context-Efficient Commands

Use `scripts/run_silent.sh` to run tests and builds. It suppresses output on success (one-line summary) and only dumps full output on failure. This keeps the context window clean.

`scripts/run_silent.sh` is a stable local wrapper that delegates to `vendor/ci-shared/scripts/run_silent.sh`, pinned to a specific `ci-shared` commit.

```bash
# Tests
./scripts/run_silent.sh "tests" npm test

# Build / typecheck
./scripts/run_silent.sh "build" npx tsc --noEmit
```

Do NOT run `npm test` or `npx tsc` directly — always use the wrapper.

## Composition Root

Composition root rules are defined in `oracle/docs/composition-root-wiring-guide.md`.

Use that guide as the source of truth for:
- interface-only wiring boundaries,
- layered assembly responsibilities,
- composition wiring test strategy.

## Docker Compose and Worktrees

Bind-mount paths in a compose file are resolved relative to the compose file's location at `docker compose up` time and frozen into the container. If that source path later disappears (e.g. the worktree it lived in was deleted), mounts break silently — the container may still report healthy while the missing config causes port or feature regressions.

- **Before removing a worktree**, check for running stacks started from it: `docker inspect <container> --format '{{json .Mounts}}'`. Stop the stack before removing the worktree.
- **Container healthy ≠ all ports reachable.** A health check that probes one port (e.g. ClickHouse TCP 9000 via `clickhouse-client`) does not verify other ports (e.g. HTTP 8123). When a service is unreachable from sibling containers, inspect mount sources and listen addresses before assuming the health check is authoritative.
- **Long-lived shared stacks** (e.g. local Langfuse) should be started from a stable workspace, not a feature worktree, to avoid the bind-mount source disappearing mid-work.

## Dependency API Versions in Specs

When a spec pins a dependency with a floor version (`>=X.0.0`), the implementation must verify the actual installed API — especially across major versions. A version floor does not guarantee API compatibility.

- Before writing instrumentation or integration code against a library, read the installed package's method signatures (`inspect.signature`, source, or official changelog).
- Specs should name the concrete API methods they expect, not just the package version, so implementation drift is detectable at review time rather than at runtime.

## Architecture Doc Review

Use this checklist when reviewing architecture/design docs in PRs.

- Ambiguity (`fail/warn/pass`): Core terms are defined once, and rules have one reasonable interpretation.
- Clarity (`fail/warn/pass`): The doc states scope, allowed behavior, and prohibited behavior in concrete terms.
- Consistency (`fail/warn/pass`): No internal contradictions across sections; examples match stated rules.
- Readability (`fail/warn/pass`): Structure is skimmable (`Purpose`, `Rules`, `Testing`, `Checklist`) with concise bullets and minimal prose.
- Best practices (`fail/warn/pass`): Guidance aligns with repo architecture constraints (ownership boundaries, composition rules, testing strategy).
- Drift resistance (`fail/warn/pass`): Critical rules use enforceable wording (`must/must not`) and include at least one verification mechanism (review checklist, tests, or CI gate).

Review output requirements:
- Provide verdict per criterion (`pass/warn/fail`).
- Reference exact locations (`file:line`).
- Provide concrete fix text for each `warn/fail`.
- Review only changed/added doc scope, unless a change creates a cross-doc contradiction.
