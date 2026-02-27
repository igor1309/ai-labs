# Nomos V0 Completion Review

Date: 2026-02-27
Plan: `nomos/docs/plans/0001-nomos-v0-implementation.md`
Scope: All 6 phases reported complete

## Verdict: 6 phases implemented, Final Gates not closed

All 6 phase checkboxes are marked `[x]` in the plan. The implementation is solid, well-tested (130 tests, ~3,500 lines of test code), and architecturally sound. However, the plan itself declares `status: proposed`, the Final Gates section has all items unchecked, and there are several concrete issues that need fixing before this can be considered truly complete.

---

## Gate Verification

| Gate | Status | Evidence |
|------|--------|----------|
| Full unit/integration test suite green | **pass** (with caveat) | 400/404 pass; 1 fail is unrelated oracle web-e2e; 3 skipped are gated e2e tests |
| TypeScript check passes (noEmit) | **pass** | `npx tsc --noEmit` exits 0 with no output |
| CI pipeline green | **not verified** | Cannot run CI here, but `nomos-core.yml` workflow exists and is correctly wired |
| Release pipeline e2e suite green | **not verified** | E2E tests gated behind `RUN_NOMOS_E2E=1` and skipped in local runs |
| Move plan to `implemented/` | **not done** | Plan still at `nomos/docs/plans/0001-nomos-v0-implementation.md` |

---

## Findings

### FAIL (must fix)

**F1. `.env.example` is incomplete** — `nomos/.env.example:15`
Phase 6 added 6 safeguard env vars (`NOMOS_SAFEGUARDS_ENABLED`, `NOMOS_SAFEGUARDS_SANITIZE`, `NOMOS_SAFEGUARDS_REINFORCE`, `NOMOS_SAFEGUARDS_BLOCK`, `NOMOS_SAFEGUARDS_REINFORCE_PREPEND`, `NOMOS_SAFEGUARDS_REINFORCE_APPEND`) that `config.js` reads, but `.env.example` doesn't document any of them. An operator deploying from `.env.example` would have no idea these configuration options exist.

**Fix**: Add a `# Safeguards` section to `.env.example` listing all 6 env vars with sensible defaults.

**F2. Plan status not updated** — `nomos/docs/plans/0001-nomos-v0-implementation.md:3`
Frontmatter still says `status: proposed`. Final Gates (lines 162-166) are all unchecked `[ ]`.

**Fix**: Update status to `implemented`, check off verified gates, move plan to `nomos/docs/plans/implemented/`.

**F3. Repo-level log incomplete** — `docs/log.md:5`
Only Phase 1 is reflected in the repo-level log. Phases 2-6 are logged in `nomos/docs/log.md` but not in the repo-level `docs/log.md`. Phase 1's CI wiring touched repo-level files (root `package.json`, `.github/workflows/`), so it was correctly logged at repo level. Phases 2-6 are nomos-only, so the project log is appropriate. However, the nomos V0 completion as a whole is a repo-level event that should be noted.

**Fix**: Add a summary entry in `docs/log.md` for Nomos V0 completion (Phases 2-6).

**F4. Preflight gate never passed** — `nomos/docs/plans/0001-nomos-v0-implementation.md:10`
Plan specifies `preflight check: [ ] done` and `worktree required: yes` with `expected worktree: worktrees/nomos-v0` and `expected branch: codex/nomos-v0`. Per CLAUDE.md, the Implementation Preflight Gate is blocking — no edits should have started before preflight passed. The preflight checkbox was never checked, meaning all 6 phases were implemented without satisfying the plan's own execution lock.

This is a process violation. The implementation itself is correct, but the plan's mandatory gate was bypassed. At this point the work is done, so the practical remediation is to acknowledge the violation in the plan and close the gate retroactively.

### WARN (should fix)

**W1. `stub-runner.test.js` misleading test name** — `nomos/tests/stub-runner.test.js`
The test named "createStubRunner requires fixturesDir" should verify that calling `createStubRunner` without `fixturesDir` fails. Verify the test actually asserts a meaningful validation error vs. a downstream runtime error.

**Fix**: Either add explicit validation in `createStubRunner` (throw if no `fixturesDir`) or rename the test to match what it actually asserts.

**W2. Duplicated test helpers across 8+ files** — `nomos/tests/`
`stubLogger()`, `setupTestDb()`, `insertProject()`, `listen()`, and `fakeRunner()` are copy-pasted across most test files. This isn't a correctness issue but increases maintenance burden.

**Fix**: Consider extracting to `nomos/tests/helpers.js`. Optional for V0 but recommended.

### PASS (no action needed)

**P1. Protocol ownership** — All three protocols (Runner, Budget, Safeguards) are correctly owned by `chat-completions.js` (the client), documented in JSDoc at the top of the file. Implementations conform without importing or depending on the client. Fully satisfies the "protocol owned by client" rule.

**P2. Composition root** — `server.js` is a clean composition root. It loads config, creates all dependencies, wires them into `createApp()`, and handles lifecycle. No service knows about any other service.

**P3. CI isolation** — `nomos-core.yml` exists as a dedicated workflow, `ci.yml` dispatches via path filter, `release.yml` installs nomos deps separately. Fully compliant with per-project CI isolation rules.

**P4. Docker/Caddy deployment** — Dockerfile uses non-root user, health check, `npm ci --production`. Compose has `restart: unless-stopped`, proper labels. Caddyfile has `flush_interval -1` for SSE passthrough.

**P5. Security** — Token hashing with SHA-256, token redaction in logs, scope enforcement, input sanitization, injection detection. No raw secrets in code or fixtures.

**P6. Test quality** — 130 tests across 14 files with excellent isolation (temp DBs, ephemeral servers on port 0, cleanup in `finally` blocks). Good edge case coverage.

**P7. Code quality** — Clean, minimal modules. No over-engineering. Consistent patterns. Factory functions for dependency injection. Proper error handling.

---

## Phase-by-Phase Summary

| Phase | Scope | Verdict | Notes |
|-------|-------|---------|-------|
| 1. Scaffold | Express, health, SQLite, Docker, CI | **pass** | All items complete, deployable skeleton established |
| 2. Runner | StubRunner, fixtures, SSE events | **pass** | 9 tests, protocol deferred to Phase 4 as planned |
| 3. Auth | Token validation, scope, redaction | **pass** | 11 tests, SHA-256 hashing, scope enforcement |
| 4. API Proxy | Routes, LiveRunner, SSE, dispatch | **pass** | 27 tests, runner protocol defined, streaming works |
| 5. Budget | Usage logging, budget checks, reports | **pass** | 28 tests, hard stop on 429, period reset |
| 6. Safeguards | Patterns, sanitization, reinforcement | **pass** | 36 tests, configurable blocking, redacted logging |

---

## Action Items (ordered by priority)

1. **F1**: Add safeguards env vars to `.env.example`
2. **F2**: Update plan status to `implemented`, check final gates, move to `implemented/`
3. **F3**: Add repo-level log entry for Nomos V0 Phases 2-6
4. **F4**: Acknowledge preflight violation in plan (retroactive close)
5. **W1**: Fix misleading stub-runner test name or add actual validation
6. **W2**: Extract duplicated test helpers (optional for V0)
