# AGENTS

> **Progressive disclosure.** This is a discovery doc — read each referenced `.agents/` file or skill when its topic is in scope, and any file marked "read at session start" up front.

## Disabled skills

`pfw-*` skills (Point-Free) are not used in this repo. Never invoke any `pfw-*` skill.

## Session start

At the first message of a session, before exploring the repo or acting, consult the
`using-dev-skills` skill to pick the ladder and invoke the matching skill. This is the
default, not optional.

## Collaboration preferences

Always-on behavioral rules — **read at session start**. See
[`.agents/collaboration-preferences.md`](.agents/collaboration-preferences.md).

## PR CI Watch

Use the `pr-ci-watch` skill. See `dev-skills/public/pr-ci-watch/SKILL.md`.

Repo-specific details:
- PR merge strategy: merge commit (`--merge`), never squash. Always use `--auto --delete-branch` flags.
- `gh pr create` does NOT support `--auto` or `--merge` flags. Auto-merge is a separate step: `gh pr merge <number> --merge --auto --delete-branch`.
- Use `./scripts/watch-pr.sh <pr>` instead of invoking `gh pr checks <pr> --watch --fail-fast > /tmp/...` directly. The wrapper encapsulates the `/tmp` redirect so the call is auto-allowed by the `Bash(./scripts/watch-pr.sh:*)` permission rule. The wrapper exits with the same status as `gh pr checks` and prints the log path on stdout.

## Specs

Use the `spec-writing` skill. See `dev-skills/public/spec-writing/SKILL.md`.

## README Components Table

Keep the `## Components` table in `README.md` current — see
[`.agents/doc-maintenance.md`](.agents/doc-maintenance.md) when adding, changing, or removing a component.

## New Project Checklist

When **any** top-level directory is added, renamed, or removed — including non-project dirs
(e.g. `backlog/`, a docs or research dir) — follow the checklist in
[`.agents/new-project-checklist.md`](.agents/new-project-checklist.md). A non-project dir needs
at minimum the `loc-dashboard.sh` `known`-list classification; a full project needs every item.

## Log

Update the relevant log for each meaningful change set before pushing — see
[`.agents/doc-maintenance.md`](.agents/doc-maintenance.md) for log locations and conventions.

`TODO.md`/backlog files hold **forward tasks only** — never session status,
done-markers, per-item progress, or findings. Completed work drops out of the
list; its record lives in git history, the produced artifacts, and the log.

## Strict TDD Mode

Use the `strict-tdd` skill. See `dev-skills/public/strict-tdd/SKILL.md`.

## Process Gates

Use the `process-gates` skill. See `dev-skills/public/process-gates/SKILL.md`.
When authoring or editing any file under `**/docs/plans/**.md`, use the
`implementation-plan` skill before writing or changing the declarations block.
See `dev-skills/public/implementation-plan/SKILL.md`.

Verification commands (always-on):
- Pre-commit/pre-push verification for Node/TypeScript code, config, dependency, CI, release, or generated-artifact changes: `./scripts/run_silent.sh "tests" npm test` and `./scripts/run_silent.sh "typecheck" npm run typecheck`.
- `npm run typecheck` fans out to one `typecheck:<project>` script per TypeScript project — `clipdeck`, `noreta`, `notio-frontend`, `session-digest` — each using that project's own tsconfig and strictness. `typecheck:clipdeck`, `typecheck:noreta`, and `typecheck:notio-frontend` mirror the typecheck step in their own `<project>-core.yml` workflow; `session-digest` has no workflow, so this local run is its only typecheck. Add a `typecheck:<project>` script and chain it into `typecheck` whenever a new TypeScript project lands. `claude-insights`'s Supabase Edge Functions are Deno TypeScript with no tsconfig, outside this fan-out, and checked with `deno check`, which needs an import map the repo does not have.
- `typecheck:notio-frontend` needs `notio/frontend`'s own dependencies, which root `npm ci` does not install. Run `npm --prefix notio/frontend ci` once per checkout, as `notio-frontend-core.yml` does.
- Swift-only scopes: `swift test` / `swift build`.

For plan authoring, archiving, and PR procedures, see [`.agents/process-gates.md`](.agents/process-gates.md) — read when planning, implementing, or opening a PR.

## Release Process

Use the `release-process` skill. See `dev-skills/public/release-process/SKILL.md`.

For repo-specific release config, CI triggers, gates, and legacy coexistence, see [`.agents/release-process.md`](.agents/release-process.md) — read when doing release work.

## ADR Governance

Use the `adr-governance` skill. See `dev-skills/public/adr-governance/SKILL.md`.

## "Protocol Owned by Client" Rule

Use the `protocol-owned-by-client` skill. See `dev-skills/public/protocol-owned-by-client/SKILL.md`.

## Per-Project CI Isolation

When adding a new project with its own dependencies, create a dedicated `<project>-core.yml` CI workflow — see
[`.agents/per-project-ci-isolation.md`](.agents/per-project-ci-isolation.md).

## FolioTell Build Rules

When working under `foliotell/` — iOS Swift sources or the Android Gradle
project — follow [`.agents/foliotell.md`](.agents/foliotell.md). iOS has a
dual SPM/Xcode-project build (new source files must be registered in
`FolioTell.xcodeproj/project.pbxproj` or the CI archive fails); Android has
sandbox build constraints and a deliberate no-root-build-script layout.

## Nomos API Keys

Each project must have its own Nomos project and API key. Do not reuse Nomos keys across projects.

## Linear

See [`docs/linear.md`](docs/linear.md) for Linear procedures, role-of-Linear rules, authoring conventions, project metadata, and MCP access notes.

## Context-Efficient Commands

Use `scripts/run_silent.sh` for Node/TypeScript tests and builds covered by the root suite. It suppresses output on success (one-line summary) and only dumps full output on failure. This keeps the context window clean.

`scripts/run_silent.sh` is a stable local wrapper that delegates to `vendor/ci-shared/scripts/run_silent.sh`, pinned to a specific `ci-shared` commit.

```bash
# Node/TypeScript tests
./scripts/run_silent.sh "tests" npm test

# Node/TypeScript typecheck (all tsconfig projects)
./scripts/run_silent.sh "typecheck" npm run typecheck

# A single project, when you only touched that one
./scripts/run_silent.sh "typecheck" npm run typecheck:noreta
```

Do NOT run `npm test`, `npm run typecheck`, or `npx tsc` directly — always use the wrapper for Node/TypeScript scopes. Use the unit's native toolchain commands for non-Node scopes such as Swift.

## Composition Root

Use the `composition-root` skill. See `dev-skills/public/composition-root/SKILL.md`.

## Docker Discipline

Use the `docker-discipline` skill. See `dev-skills/public/docker-discipline/SKILL.md`.

## Infrastructure Topology

Do not assume that services share or do not share a VPS, ports, or any other infrastructure. If topology matters for the task (e.g., port selection, deploy targets, shared filesystems), verify from docs/ADRs or ask — never presume.

## Dependency API Versions in Specs

When a spec pins a dependency with a floor version (`>=X.0.0`), the implementation must verify the actual installed API — especially across major versions. A version floor does not guarantee API compatibility.

- Before writing instrumentation or integration code against a library, read the installed package's method signatures (`inspect.signature`, source, or official changelog).
- Specs should name the concrete API methods they expect, not just the package version, so implementation drift is detectable at review time rather than at runtime.

## Architecture Doc Review

Use the `arch-doc-review` skill. See `dev-skills/public/arch-doc-review/SKILL.md`.

## Verify Before Hedging

Any time you are about to state a claim about checkable system state — during design, planning, or review — run the check first. Do not write conditional claims of the form "if X still exists…", "may cause Y…", "likely blocks Z…", or "worth confirming W" when a single `ls`, `grep`, `git log`, or `gh` call would resolve it. Run the check inline and state the finding flatly. Reserve hedges for things that genuinely cannot be verified from current state (intent, future plans, runtime behavior on unreachable infra).
