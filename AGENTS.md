# AGENTS

## Disabled skills

`pfw-*` skills (Point-Free) are not used in this repo. Never invoke any `pfw-*` skill.

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
- `trunk` is a protected branch. Never commit or push directly to `trunk`. All changes must go through a PR from a dedicated branch.
- PR merge strategy: use merge commit (`--merge`), never squash. Always use `--auto --delete-branch` flags.
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

## README Components Table

The `## Components` table in `README.md` lists every component with its type and one-line description. Keep it current:

- Add a row when a new component (product, service, MCP tool, observability) is introduced.
- Update the Type or Description when a component's role changes.
- Remove the row when a component is deleted from the repo.

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
- Run tests via the changed unit's native test command. Use `./scripts/run_silent.sh "tests" npm test` for Node/TypeScript scopes covered by the root suite.

## No-Junk Scope Lock

Do not add anything not required by current scope or the current failing test.

- No new modules or packages unless explicitly requested.
- No default or fallback dependencies unless explicitly requested.
- No placeholder behavior that is not demanded by tests.
- No side docs or log updates for micro-steps.
- If a change does not directly turn current RED into GREEN, do not add it.

## Process Gates

Use the `process-gates` skill. See `.claude/skills/process-gates/SKILL.md`.

Repo-specific details:
- Pre-commit/pre-push verification for Node/TypeScript: `./scripts/run_silent.sh "tests" npm test` and `./scripts/run_silent.sh "build" npx tsc --noEmit`.
- Swift-only scopes: `swift test` / `swift build`.
- Log locations: `docs/log.md` (repo-level), `<project>/docs/log.md` (project-level).
- Plans directory: `docs/plans/` → `docs/plans/implemented/` (or `<project>/docs/plans/` → `<project>/docs/plans/implemented/`).
- Worktree convention: `worktrees/<slug>` with branch `codex/<slug>`.

## Release Process

Use the `release-process` skill. See `.claude/skills/release-process/SKILL.md`.

Repo-specific details:
- Governed by ADR-000 through ADR-006 (`docs/adr/release/`).
- Config: `release-units.config.toml`; manifest: `release-units.toml`; generator: `scripts/release/generate-manifest.js`.
- CI trigger: `.github/workflows/release-unit.yml`. Release detection: `detect-releases.js`; tag creation: `create-tags.js`.
- Pre-push gate for Node/TypeScript: `./scripts/run_silent.sh "build" npx tsc --noEmit` and `./scripts/run_silent.sh "tests" npm test`.
- Smoke model: `vars.OPENROUTER_CI_MODEL` and `secrets.OPENROUTER_API_KEY`.
- Legacy coexistence: the existing `v*` tag namespace (`.github/workflows/release.yml`, Oracle-specific) coexists with the new `<basename>_v*` namespace. The legacy workflow is not modified; migration is deferred.

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

## Nomos API Keys

Each project must have its own Nomos project and API key. Do not reuse Nomos keys across projects.

## Context-Efficient Commands

Use `scripts/run_silent.sh` for Node/TypeScript tests and builds covered by the root suite. It suppresses output on success (one-line summary) and only dumps full output on failure. This keeps the context window clean.

`scripts/run_silent.sh` is a stable local wrapper that delegates to `vendor/ci-shared/scripts/run_silent.sh`, pinned to a specific `ci-shared` commit.

```bash
# Node/TypeScript tests
./scripts/run_silent.sh "tests" npm test

# Node/TypeScript build / typecheck
./scripts/run_silent.sh "build" npx tsc --noEmit
```

Do NOT run `npm test` or `npx tsc` directly — always use the wrapper for Node/TypeScript scopes. Use the unit's native toolchain commands for non-Node scopes such as Swift.

## Composition Root

Composition root rules are defined in `oracle/docs/composition-root-wiring-guide.md`.

Use that guide as the source of truth for:
- interface-only wiring boundaries,
- layered assembly responsibilities,
- composition wiring test strategy.

## Docker Discipline

Use the `docker-discipline` skill. See `.claude/skills/docker-discipline/SKILL.md`.

## Infrastructure Topology

Do not assume that services share or do not share a VPS, ports, or any other infrastructure. If topology matters for the task (e.g., port selection, deploy targets, shared filesystems), verify from docs/ADRs or ask — never presume.

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
