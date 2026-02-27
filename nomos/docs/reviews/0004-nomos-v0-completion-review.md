# Nomos V0 Completion Review (Fourth Pass)

Date: 2026-02-27
Plan: `nomos/docs/plans/implemented/0001-nomos-v0-implementation.md`
Prior reviews: `archived/0001-..`, `archived/0002-..`, `archived/0003-nomos-v0-completion-review.md`
Scope: All 6 phases reported complete; verify all prior review findings closed; independent code + test + deployment review
Reviewer: Claude Opus 4.6 (fresh session, no prior review context)

## Verdict: Complete — all phases delivered, all prior findings resolved

All 6 phases are implemented. 147 nomos tests pass (417 repo-wide, 0 failures, 7 skipped — 2 are gated nomos e2e, 5 are oracle web-e2e). TypeScript check passes. All prior review findings (F1–F4, W1–W2 from review 0001; W1 from review 0002; W1–W5, TF1–TF3, TW1–TW9 from review 0003) are resolved.

New findings below: 2 FAIL, 4 WARN, 3 INFO. The 2 FAIL findings are correctness issues in the error handler that affect API consistency in production but do not block V0 release — they are low-risk for internal consumers (Oracle).

---

## Gate Verification

| Gate | Status | Evidence |
|------|--------|----------|
| Full unit/integration test suite green | **pass** | 417/417 pass; 7 skipped (2 nomos e2e, 5 oracle web-e2e) |
| TypeScript check passes (noEmit) | **pass** | `npx tsc --noEmit` exits 0 |
| CI pipeline green | **not verified** | Cannot run CI locally; `nomos-core.yml` is correctly wired |
| Release pipeline e2e suite green | **not verified** | E2E tests gated behind `RUN_NOMOS_E2E=1`; 2 tests skipped locally |
| Plan moved to `implemented/` | **pass** | `nomos/docs/plans/implemented/0001-nomos-v0-implementation.md`, frontmatter `status: implemented` |

---

## Prior Review Finding Status

All findings from reviews 0001, 0002, and 0003 are resolved:

### Reviews 0001/0002 Findings

| Finding | Original Severity | Status | Verification |
|---------|-------------------|--------|-------------|
| F1. `.env.example` incomplete | FAIL | **resolved** | All 15 config vars present, matches `config.js` 1:1 |
| F2. Plan status not updated | FAIL | **resolved** | Frontmatter: `status: implemented`, preflight: `[x] done (retroactive)` |
| F3. Repo-level log incomplete | FAIL | **resolved** | `docs/log.md` has V0 completion entries |
| F4. Preflight gate violated | FAIL | **resolved** | Acknowledged retroactively in plan frontmatter |
| W1. Misleading stub-runner test name | WARN | **resolved** | Test renamed, validation added |
| W2. Duplicated test helpers | WARN | **resolved** | `tests/helpers.js` exports 8 shared helpers |
| W1-new. nomos not wired as npm workspace | WARN | **resolved** | `"workspaces": ["nomos"]` in root `package.json` |

### Review 0003 Code Findings

| Finding | Original Severity | Status | Verification |
|---------|-------------------|--------|-------------|
| W1. StubRunner path traversal | WARN | **resolved** | `stub-runner.js:9-15`: `resolve()` + `startsWith()` guard |
| W2. Test helper duplication in app/health | WARN | **accepted** | Intentional — avoids `better-sqlite3` dependency for lightweight tests |
| W3. `cleanupTestDb` inconsistent usage | WARN | **accepted** | Low priority; some files use inline cleanup |
| W4. Streaming usage tracking upstream dep | WARN | **resolved** | Comment added at `chat-completions.js:138-139` |
| W5. Plan final gates partially unchecked | WARN | **accepted** | Lines 164-165 cannot be verified locally; CI-only gates |

### Review 0003 Test Findings

| Finding | Original Severity | Status | Verification |
|---------|-------------------|--------|-------------|
| TF1. Tautological hashToken test | FAIL | **resolved** | `auth.test.js:11`: hardcoded known-good hash `"ea5add57..."` |
| TF2. No malformed JSON body test | FAIL | **resolved** | `chat-completions.test.js:311`: tests `"not valid json{{{"` → 400 |
| TF3. No missing Content-Type test | FAIL | **resolved** | `chat-completions.test.js:330`: tests missing header → 400 |
| TW1. `fakeRunner` duplicated | WARN | **resolved** | Moved to `helpers.js:49-77`, imported by routing + budget-integration |
| TW2. Schema tests manual DB setup | WARN | **accepted** | Reasonable — schema tests need fine-grained DB control |
| TW3. Object identity assertion | WARN | **resolved** | `safeguards.test.js:155-162`: now asserts `.role` and `.content` values |
| TW4. Time-sensitive `new Date()` | WARN | **resolved** | `budget-integration.test.js:8`: uses `FIXED_DATE = "2099-01-01"` |
| TW5. No concurrent budget writes test | WARN | **accepted** | Inherently safe with synchronous `better-sqlite3` |
| TW6. No cross-project usage isolation | WARN | **resolved** | `budget-integration.test.js:415-457`: asserts project isolation |
| TW7. E2E SSE assertion too lenient | WARN | **resolved** | `e2e-health.test.js:53`: exact `assert.equal(dataLines.length, 6)` |
| TW8. No `redactContent` boundary test | WARN | **resolved** | `safeguards.test.js:325-332`: tests `maxLen=0` and `maxLen=1` |
| TW9. LiveRunner timeout test missing | WARN | **resolved** | `live-runner.test.js:290-339`: both execute + executeStream timeout tests |

---

## New Findings

### FAIL — should fix

**F1. Error handler swallows client error status codes** — `nomos/src/app.js:43-46`

The error handler always responds with `res.status(500)`, ignoring `err.status`/`err.statusCode` set by Express middleware. This causes Express's `json()` body-parser errors (malformed JSON → `err.status = 400`) to return 500 in production instead of 400.

Verified empirically: sending malformed JSON to the real app returns `500 {"error":"internal server error"}`, not the expected 400.

The test at `chat-completions.test.js:311` passes only because `createTestApp()` omits the error handler — Express's default error handler respects `err.status`. The test does not accurately reflect production behavior.

Risk: **Low-medium**. Affects API ergonomics for internal consumers (Oracle). Malformed requests return unhelpful 500s instead of descriptive 400s. No security or data integrity impact.

Fix:
```js
app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  logger.error("unhandled error", { error: err.message, status });
  res.status(status).json({
    error: status < 500 ? err.message : "internal server error",
  });
});
```

**F2. Unknown routes return HTML instead of JSON** — `nomos/src/app.js`

The app has no catch-all 404 handler. Express's default 404 response is HTML (`Cannot POST /v1/images/generations`). An authenticated request to an unregistered route (e.g., `/v1/images/generations`) returns an HTML page instead of a JSON error. This also means if `liveRunner` is null (no `NOMOS_VENDOR_BASE_URL`), authenticated requests to `/v1/chat/completions` return HTML 404.

Verified empirically: `Cannot POST /v1/images/generations` as HTML.

Risk: **Low**. Only affects unregistered routes, which internal consumers shouldn't hit. But for API consistency, all endpoints should return JSON.

Fix: add before the error handler:
```js
app.use((_req, res) => {
  res.status(404).json({ error: "not found" });
});
```

### WARN — should address (none block V0)

**W1. `redactContent` lenient assertion** — `nomos/tests/safeguards.test.js:311`

`assert.ok(redacted.length < 100)` — output is deterministically 53 characters (`"A"×25 + "..." + "A"×25`). An exact assertion would be stronger. Low priority.

**W2. `redactContent` boundary behavior produces longer output than maxLen** — `nomos/src/safeguards.js:25-30`

`redactContent("hello", 1)` returns `"..."` (3 chars > maxLen=1). `redactContent("hello", 0)` also returns `"..."`. The tests document this behavior (lines 325-332) but it's semantically surprising. Not a bug since redaction is for logging, but worth a comment in the source.

**W3. Missing `.dockerignore`** — `nomos/`

No `.dockerignore` file. The build context sends `tests/`, `docs/`, `data/`, `.git/` to the Docker daemon, inflating build time and context size. Does not affect the image contents (only `src/` and `package*.json` are COPY-ed). Fix: add a `.dockerignore` excluding `tests/`, `docs/`, `data/`, `.env`, `.git/`, `node_modules/`.

**W4. No test for `redactToken` at boundary (exactly 8 chars)** — `nomos/tests/auth.test.js`

Production code: `if (!token || token.length < 8) return "***"`. Tests check 5-char and 16-char tokens but not the boundary at exactly 8 characters — the first length that produces the `"xxxx***yyyy"` format. Low priority.

### INFO — acknowledged, no action needed for V0

**I1. Graceful shutdown has no drain timeout** — `nomos/src/server.js:47-54`

`server.close()` waits for all connections to close, but SSE streams can hold connections indefinitely. The container's SIGKILL timeout (Docker default 10s) handles this in practice. Future hardening: add a drain timeout with `setTimeout(() => process.exit(1), 10000)`.

**I2. Health endpoint is a liveness probe only** — `nomos/src/app.js:8-10`

Returns `{ status: "ok" }` unconditionally without checking DB accessibility. Acceptable for V0 — failures surface as 500s on actual API calls.

**I3. `depends_on` without health condition** — `nomos/docker-compose.yml`

Caddy `depends_on: nomos` doesn't use `condition: service_healthy` despite the Dockerfile HEALTHCHECK. Caddy retries upstream connections, so this works in practice.

---

## Architecture Review

### Protocol Ownership — pass

All three business protocols defined in `chat-completions.js:1-18` via JSDoc:

| Protocol | Owner | Implementations |
|----------|-------|-----------------|
| Runner (`execute`, `executeStream`) | `chat-completions.js` | `live-runner.js`, `stub-runner.js` |
| Budget (`checkBudget`, `logUsage`, `getUsageReport`) | `chat-completions.js` | `budget.js` |
| Safeguards (`scanMessages`, `reinforceMessages`) | `chat-completions.js` | `safeguards.js` |

No implementation imports the client. Fully compliant with "protocol owned by client" rule.

### Composition Root — pass

`server.js` is the single composition root:
- Loads config, creates logger, opens DB, initializes schema
- Creates all services with injected dependencies
- Wires into `createApp()` → `app.listen()`
- Handles graceful shutdown (SIGTERM/SIGINT)

No module knows about any other module. All cross-cutting wiring flows through the composition root.

### Dependency Flow — pass

```
server.js (composition root)
├── config.js       (no imports)
├── logger.js       (no imports)
├── db.js           (no imports)
├── schema.js       (no imports)
├── live-runner.js   (no imports)
├── stub-runner.js   (no imports — path validation is self-contained)
├── budget.js        (no imports)
├── safeguards.js    (no imports)
└── app.js           (imports auth.js, chat-completions.js — wired via DI)
    └── chat-completions.js (no imports — receives services via injection)
```

No circular dependencies. Clean layering.

### CI Isolation — pass

- `nomos-core.yml` runs only nomos tests + typecheck
- `ci.yml` dispatches to `nomos-core` via path filter on `nomos/**`
- Shared file changes (root `package.json`, scripts, etc.) trigger all projects
- `release.yml` runs the full suite independently

---

## Security Review

| Area | Verdict | Notes |
|------|---------|-------|
| Token handling | **pass** | SHA-256 hashing (`auth.js:3-5`), redaction (`auth.js:7-9`), logs use `token_hash` only |
| SQL injection | **pass** | All DB access uses parameterized `?` placeholders. No string interpolation in SQL. |
| Foreign key enforcement | **pass** | `better-sqlite3` enables `PRAGMA foreign_keys = ON` by default. Verified empirically. |
| Input validation | **pass** | `model` required, `messages` required + array check. Express `json()` middleware rejects oversized bodies (100KB default). |
| Path traversal | **pass** | `stub-runner.js:9-15`: `resolve()` + `startsWith()` guard prevents directory escape |
| Container security | **pass** | Non-root user, `npm ci --production`, health check, no baked secrets |
| Injection prevention | **pass** | 8 regex patterns, sanitization strips dangerous chars, configurable blocking mode |

---

## Deployment Review

| Component | Verdict | Notes |
|-----------|---------|-------|
| Dockerfile | **pass** | Alpine Node 22, non-root, health check, production deps only |
| docker-compose.yml | **pass** | Restart policy, named volumes, logging labels, internal port only |
| Caddyfile | **pass** | `flush_interval -1` disables SSE buffering, TLS documented |
| .env.example | **pass** | All 15 config knobs from `config.js` documented |
| CI workflow | **pass** | `nomos-core.yml` runs tests + typecheck with `run_silent.sh` |
| Ops runbook | **pass** | Comprehensive: install, deploy, rollback, backup, restore, token rotation, incident triage |

---

## Phase-by-Phase Summary

| Phase | Deliverables | Tests | Verdict |
|-------|-------------|-------|---------|
| 1. Scaffold | Express app, health, SQLite WAL, Docker, Caddy, CI | ~9 | **pass** |
| 2. Runner | StubRunner, fixtures, SSE events, path traversal guard | 10 | **pass** |
| 3. Auth | Token hash/validate, scope enforcement, redaction | 11 | **pass** |
| 4. API Proxy | Routes, LiveRunner, SSE streaming, dispatch, timeouts | 31 | **pass** |
| 5. Budget | Usage logging, budget check/enforce, reports, isolation | 26 | **pass** |
| 6. Safeguards | 8 patterns, sanitization, reinforcement, blocking, redaction boundaries | 37 | **pass** |

All phase deliverables match the plan. No missing items.

---

## Code Quality Summary

| Metric | Value |
|--------|-------|
| Source modules | 12 |
| Source lines | ~752 |
| Test files | 14 + 1 helpers + 3 fixtures |
| Test count | 147 (2 skipped e2e) |
| Test lines | ~3,500 |
| Dependencies | 2 (express, better-sqlite3) |
| Test:code ratio | ~4.7:1 |

---

## Test Suite Assessment — Score: 8/10

Significant improvement from the third-pass score of 7/10. All FAIL findings resolved. Most WARN findings resolved. Remaining items are minor edge cases:

| Category | Count |
|----------|-------|
| FAIL (must fix) | 0 |
| WARN (should fix) | 2 (lenient assertion W1, boundary test W4) |
| INFO (minor) | 3 (empty messages array, all-caps injection pattern, non-JSON vendor 200) |
| PASS | All major behavioral areas covered |

---

## Action Items (ordered by priority)

### Code fixes
1. **F1**: Fix error handler to respect `err.status` (malformed JSON → 500 in production)
2. **F2**: Add catch-all JSON 404 handler before error handler

### Test fixes
3. **W1**: Tighten `redactContent` assertion from `< 100` to exact value
4. **W4**: Add `redactToken` boundary test at exactly 8 characters

### Deployment fixes
5. **W3**: Add `.dockerignore` to reduce build context
6. **W2**: Document `redactContent` boundary behavior with comment

### Deferred (post-V0)
7. **I1**: Add graceful shutdown drain timeout
8. **I2**: Consider readiness probe (DB connectivity check) for health endpoint
9. **I3**: Use `depends_on: condition: service_healthy` in compose
