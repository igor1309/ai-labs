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
5. If separate worktree is required and preflight is `fail`, stop immediately and ask for direction. Do not implement until this is resolved.
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
12. Move completed plan from `docs/plans/` to `docs/plans/implemented/`, commit the move, and create a PR.

## Release Process

Release policy is outcome-based. Commands are implementation detail; these invariants are mandatory:

- **Start state**: release from `trunk`.
- **SemVer decision**: choose release bump per SemVer 2.0 from the delta since the previous tag (or full history on first release).
- **Release notes**: add exactly one new top entry in the release-scope log (`docs/log.md` for repo-level releases, `<project>/docs/log.md` for project releases) at the top of the current date section, if present, scoped to that reviewed delta.
- **Version consistency**: `package.json` version, `package-lock.json` version, and release tag `vX.Y.Z` must match.
- **Push safety**: push only `trunk` and the explicit release tag; never `git push --tags`.
- **Pre-push gate**: run BOTH `./scripts/run_silent.sh "build" npx tsc --noEmit` AND `./scripts/run_silent.sh "tests" npm test` before tagging. `tsx` (test runner) ignores unused imports; `tsc` (CI build) does not.
- **Deployment gate**: releases deploy via CI on tag push after tests pass.

## "protocol owned by client" rule

- The client defines and owns the dependency shape (protocol/interface/data model).
- A protocol MUST live in the same module as its client. Separating them is a violation.
- If the client is public, its protocol must be public so composition can supply an implementation.
- Composition layer(s) adapts concrete implementations to client-owned protocols.
- Modules MUST NOT know about CLI or each other.

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
