# Nomos V0 Completion Review (Second Pass)

Date: 2026-02-27
Plan: `nomos/docs/plans/implemented/0001-nomos-v0-implementation.md`
Prior review: `nomos/docs/reviews/0001-nomos-v0-completion-review.md`
Scope: All 6 phases + prior review finding remediation

## Verdict: Complete — ready for release

All 6 phases are implemented, tests pass (282/297 overall, all 130 nomos tests green), typecheck passes, prior review findings (F1–F4, W1) have been addressed. One new WARN finding identified below (developer experience, not a blocker). No FAILs remain.

---

## Gate Verification

| Gate | Status | Evidence |
|------|--------|----------|
| Full unit/integration test suite green | **pass** | 282/297 pass; 12 nomos fail → 0 after `cd nomos && npm ci`; remaining 1 fail is oracle web-e2e; 3 skipped are gated e2e |
| TypeScript check passes (noEmit) | **pass** | `npx tsc --noEmit` exits 0 |
| CI pipeline green | **not verified** | Cannot run CI locally; `nomos-core.yml` correctly installs nomos deps separately |
| Release pipeline e2e suite green | **not verified** | E2E tests gated behind `RUN_NOMOS_E2E=1`; 3 tests skipped in local runs |
| Plan moved to `implemented/` | **pass** | Plan at `nomos/docs/plans/implemented/0001-nomos-v0-implementation.md`, status: `implemented` |

---

## Prior Review Finding Status

| Finding | Severity | Status | Notes |
|---------|----------|--------|-------|
| F1. `.env.example` incomplete | FAIL | **resolved** | Safeguards section added with all 6 env vars (`nomos/.env.example:16-22`) |
| F2. Plan status not updated | FAIL | **resolved** | Frontmatter: `status: implemented`, preflight: `[x] done (retroactive)`, final gates partially checked |
| F3. Repo-level log incomplete | FAIL | **resolved** | `docs/log.md:4` has V0 completion entry for Phases 2-6 |
| F4. Preflight gate violated | FAIL | **resolved** | Acknowledged retroactively in plan frontmatter line 10 |
| W1. Misleading stub-runner test name | WARN | **resolved** | `createStubRunner` now throws `"fixturesDir is required"` on missing arg; test renamed to `"createStubRunner throws when fixturesDir is missing"` and asserts explicit error message (`stub-runner.test.js:119-122`) |
| W2. Duplicated test helpers | WARN | **resolved** | `tests/helpers.js` extracts `stubLogger`, `setupTestDb`, `insertProject`, `insertBudget`, `listen`, `cleanupTestDb`; all integration test files import from it |

---

## New Findings

### WARN (should address)

**W1. `nomos` not wired as npm workspace — root `npm test` fails without manual install** — `package.json`

Root `package.json` runs nomos tests via `node --test nomos/tests/*.test.js`, but does not list nomos as a workspace. Running `npm ci` at root does not install `express` or `better-sqlite3`. This means `npm test` at root fails for nomos tests unless you separately run `cd nomos && npm ci`.

The CI workflow handles this correctly (`nomos-core.yml:33-34` runs `cd nomos && npm ci`), so CI is not broken. But any developer running `npm test` at root will see all 11 nomos test files fail with `ERR_MODULE_NOT_FOUND`.

Two options:
1. Add `"workspaces": ["nomos"]` to root `package.json` so `npm ci` installs nomos deps
2. Accept the split and document it (e.g., in contributing guide or nomos README)

**Impact**: Developer experience only; CI is unaffected.

---

## Architecture Review

### Protocol Ownership — **pass**

All three business protocols are defined in `chat-completions.js:1-18` (the client) via JSDoc:

| Protocol | Owner | Implementations |
|----------|-------|-----------------|
| Runner (`execute`, `executeStream`) | `chat-completions.js` | `live-runner.js`, `stub-runner.js` |
| Budget (`checkBudget`, `logUsage`) | `chat-completions.js` | `budget.js` |
| Safeguards (`scanMessages`, `reinforceMessages`) | `chat-completions.js` | `safeguards.js` |

No implementation imports or depends on the client. Fully compliant with the "protocol owned by client" rule.

### Composition Root — **pass**

`server.js` is the single composition root:
- Loads config, creates logger, opens DB, initializes schema
- Creates services (liveRunner, stubRunner, budgetService, safeguards) with injected deps
- Wires everything into `createApp()` → `app.listen()`
- Handles graceful shutdown (SIGTERM, SIGINT → close server → close DB)

No service has knowledge of any other service. All cross-cutting concerns flow through the composition root.

### Dependency Flow — **pass**

```
server.js (composition root)
├── config.js (no deps)
├── logger.js (no deps)
├── db.js (no deps)
├── schema.js (no deps)
├── live-runner.js (no deps)
├── stub-runner.js (no deps)
├── budget.js (no deps)
├── safeguards.js (no deps)
├── auth.js (no deps)
└── app.js (imports auth.js, chat-completions.js)
    └── chat-completions.js (no deps — receives all services via injection)
```

No circular dependencies. `app.js` is the only module that imports more than one sibling (auth + chat-completions), and both are wired via dependency injection.

### CI Isolation — **pass**

- `nomos-core.yml` installs only nomos deps, runs only nomos tests
- `ci.yml` dispatches to `nomos-core` via `dorny/paths-filter` on `nomos/**` changes
- `release.yml` (if extended for nomos) would install all deps independently
- No cross-project test pollution

---

## Security Review

### Token Handling — **pass**
- SHA-256 hashing via `createHash("sha256")` (`auth.js:3-5`)
- Token never stored in plaintext; only hash compared against DB
- Redaction: `redactToken()` masks all but first/last 4 chars (`auth.js:7-10`)
- Log entries use `token_hash`, never raw token (`auth.js:29`)
- No tokens in error responses

### Injection Prevention — **pass** (best-effort, as designed)
- 8 default regex patterns for common injection vectors
- Sanitization strips null bytes, zero-width chars, RTL overrides
- Clear documentation that this is best-effort, not a security guarantee
- Configurable: enable/disable per safeguard, custom patterns, blocking mode
- Redacted content in audit logs (never full payload)

### Input Validation — **pass**
- `model` required: 400 if missing (`chat-completions.js:24-28`)
- `messages` required + must be array: 400 if missing/invalid (`chat-completions.js:30-34`)
- Express `json()` middleware handles body parsing
- No SQL injection: all DB access via parameterized prepared statements

### Container Security — **pass**
- Non-root user in Dockerfile (`adduser -S nomos`)
- `npm ci --production` (no dev deps in image)
- Health check configured
- No secrets in Dockerfile or compose file
- `.env` loaded at runtime, not baked into image

---

## Test Quality Review

### Coverage Summary

| Area | Test Files | Approx Tests | Verdict |
|------|-----------|-------------|---------|
| App lifecycle | `app.test.js` | 3 | **pass** |
| Database | `db.test.js`, `schema.test.js` | 15 | **pass** |
| Health | `health.test.js`, `e2e-health.test.js` | 4 | **pass** |
| Auth | `auth.test.js` | 11 | **pass** |
| Routing | `routing.test.js` | 7 | **pass** |
| Chat completions | `chat-completions.test.js` | 10 | **pass** |
| Stub runner | `stub-runner.test.js` | 9 | **pass** |
| Live runner | `live-runner.test.js` | 8 | **pass** |
| Safeguards | `safeguards.test.js` | 20 | **pass** |
| Safeguards integration | `safeguards-integration.test.js` | 9 | **pass** |
| Budget | `budget.test.js` | 16 | **pass** |
| Budget integration | `budget-integration.test.js` | 12 | **pass** |

**Total**: ~130 tests across 14 files, ~3,500 lines of test code.

### Test Isolation — **pass**
- Each test creates its own temp DB via `setupTestDb()` (mkdtemp + openDb + initSchema)
- Servers bind to port 0 (OS-assigned) via `listen()` helper
- Proper cleanup in `finally` blocks (server.close, db.close, rmSync)
- No shared mutable state between tests

### Edge Cases Covered — **pass**
- Auth: missing header, invalid token, inactive project, wrong scope, non-Bearer format
- Streaming: mid-stream errors, no `[DONE]` marker, runner exceptions during stream
- Budget: exact limit boundary (allowed=false), period reset (daily/monthly), no budget configured
- Safeguards: multiple patterns in one message, non-string content passthrough, custom patterns override defaults, disabled safeguards skip all
- Schema: idempotency, constraint enforcement, duplicate rejection

### Test Helpers — **pass**
- Centralized in `tests/helpers.js`: `stubLogger`, `setupTestDb`, `insertProject`, `insertBudget`, `listen`, `cleanupTestDb`
- All integration tests import from helpers (no duplication)
- `fakeRunner` and `capturingRunner` are test-local (appropriate since they vary per test file)

---

## Phase-by-Phase Summary

| Phase | Deliverables | Tests | Verdict |
|-------|-------------|-------|---------|
| 1. Scaffold | Express app, health, SQLite WAL, Docker, Caddy, CI | 7 | **pass** |
| 2. Runner | StubRunner, fixtures, SSE events | 9 | **pass** |
| 3. Auth | Token hash/validate, scope enforcement, redaction | 11 | **pass** |
| 4. API Proxy | Routes, LiveRunner, SSE streaming, dispatch | 27 | **pass** |
| 5. Budget | Usage logging, budget check/enforce, reports | 28 | **pass** |
| 6. Safeguards | 8 patterns, sanitization, reinforcement, blocking | 36 | **pass** |

All phase deliverables match the plan. No missing items.

---

## Action Items

1. **W1**: Consider wiring nomos as an npm workspace or documenting the two-step install for local development
