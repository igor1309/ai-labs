# AGENTS

## Collaboration preferences

- Follow the written plan/docs as the source of truth; do not invent steps or rename phases.
- Make small, reviewable changes and stop after each step for review.
- Add tests alongside changes, not later.
- Always run tests on code changes.
- Require a full test suite pass before declaring completion.
- Require a full test suite pass for each phase step before moving to the next step.
- Commit only when tests are passing for the current branch state.
- Protocols are owned by their client and MUST live in the same module. A protocol without its client is a violation.
- Keep scope minimal and explicit; avoid scope creep.
- Log entries are in reverse chronological order (newest first).
- Tests must cover reasonable edge cases for new or changed behavior.
- Versioning: bump only the packages with code changes, keep `package.json` and `package-lock.json` root versions aligned, and update lockfile entries when package versions change.

## Step closeout protocol

Mandatory after each implementation step:

1. Self-review the step against the approved spec and implementation plan scope.
2. Fix any issues found in the self-review.
3. Run the full test suite and fix failures until it passes.
4. Summarize what changed and why.
5. Commit only files related to the current step.
6. Push the branch to `origin` unless explicitly instructed not to push.
7. Stop and wait for review approval before starting the next step.

## Release Process

Release policy is outcome-based. Commands are implementation detail; these invariants are mandatory:

- **Start state**: release from `trunk`.
- **SemVer decision**: choose release bump per SemVer 2.0 from the delta since the previous tag (or full history on first release).
- **Release notes**: add exactly one new top entry in `docs/log.md` for this release, scoped to that reviewed delta.
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