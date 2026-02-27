# Nomos V0 Completion Review (Third Pass)

Date: 2026-02-27
Plan: `nomos/docs/plans/implemented/0001-nomos-v0-implementation.md`
Prior reviews: `0001-nomos-v0-completion-review.md`, `archived/0002-nomos-v0-completion-review.md`
Scope: All 6 phases reported complete; verify prior review findings closed; independent code review

## Verdict: Complete — all phases delivered, prior findings resolved

All 6 phases are implemented. 130 nomos tests pass (401/405 repo-wide, the 1 failure is unrelated oracle web-e2e, 3 skipped are gated e2e). TypeScript check passes. Prior review findings (F1–F4, W1–W2) are all resolved. Plan status is `implemented`, plan moved to `implemented/`, repo-level log updated. The implementation is solid, minimal, and architecturally clean.

New findings below are all WARN severity — none block the V0 release.

---

## Gate Verification

| Gate | Status | Evidence |
|------|--------|----------|
| Full unit/integration test suite green | **pass** | 401/405 pass; 1 fail is oracle web-e2e (unrelated); 3 skipped are gated nomos e2e |
| TypeScript check passes (noEmit) | **pass** | `npx tsc --noEmit` exits 0 |
| CI pipeline green | **not verified** | Cannot run CI locally; `nomos-core.yml` is correctly wired |
| Release pipeline e2e suite green | **not verified** | E2E tests gated behind `RUN_NOMOS_E2E=1`; 3 tests skipped locally |
| Plan moved to `implemented/` | **pass** | `nomos/docs/plans/implemented/0001-nomos-v0-implementation.md`, frontmatter `status: implemented` |

---

## Prior Review Finding Status

All findings from reviews 0001 and 0002 are resolved:

| Finding | Original Severity | Status | Verification |
|---------|-------------------|--------|-------------|
| F1. `.env.example` incomplete | FAIL | **resolved** | All 6 safeguard env vars present (`nomos/.env.example:16-22`) |
| F2. Plan status not updated | FAIL | **resolved** | Frontmatter: `status: implemented`, preflight: `[x] done (retroactive)` |
| F3. Repo-level log incomplete | FAIL | **resolved** | `docs/log.md:5` has V0 Phases 2-6 completion entry |
| F4. Preflight gate violated | FAIL | **resolved** | Acknowledged retroactively in plan frontmatter line 10 |
| W1. Misleading stub-runner test name | WARN | **resolved** | Test renamed, explicit validation added (`stub-runner.js:5-7`, `stub-runner.test.js:119-122`) |
| W2. Duplicated test helpers | WARN | **resolved** | `tests/helpers.js` exports 6 shared helpers; integration test files import from it |
| W1-new. nomos not wired as npm workspace | WARN | **resolved** | `"workspaces": ["nomos"]` in root `package.json`; `npm ci` at root installs nomos deps |

---

## New Findings

### WARN (should address — none block V0 release)

**W1. StubRunner model-to-filename path traversal** — `nomos/src/stub-runner.js:10`

`request.model` is used directly in `join(fixturesDir, request.model + ".json")` without path validation. A request with `model: "../../etc/passwd"` would read outside the fixtures directory.

Risk: **Low**. The stub API is gated by `NOMOS_STUB_ENABLED=false` (default) and requires `scope=stub` auth. An attacker would need a valid stub-scoped token to reach this code, and the `.json` extension limits the attack surface. Still, defense-in-depth recommends validating the model name.

Fix: Add a guard that rejects model names containing path separators:
```js
if (request.model.includes("/") || request.model.includes("\\")) {
  throw new Error(`invalid model name: ${request.model}`);
}
```

**W2. Test helper duplication in app.test.js and health.test.js** — `nomos/tests/app.test.js:5-11`, `nomos/tests/health.test.js:5-11`

Both files define local `stubLogger()` and `stubDb()` instead of importing from `tests/helpers.js`. The `stubDb()` stub is not in helpers at all. While review 0002 reported W2 as resolved, these two files were missed — they still use local stubs instead of the shared helpers.

Fix: Either import `stubLogger` from helpers (and add `stubDb` to helpers), or accept that these two lightweight test files intentionally avoid the DB dependency that helpers.js imports. The latter is a reasonable choice — `app.test.js` and `health.test.js` don't need a real database, so importing helpers.js (which imports `better-sqlite3`) would be unnecessary coupling.

Recommendation: Accept as-is. The local stubs are intentional — they avoid pulling in `better-sqlite3` for tests that don't need it.

**W3. `cleanupTestDb()` exported but not consistently used** — `nomos/tests/helpers.js:44-47`

`cleanupTestDb(db, tmp)` is exported but multiple test files still use inline `db.close(); rmSync(tmp, ...)` cleanup. Not a correctness issue but inconsistent.

Fix: Either remove the export and let tests inline the cleanup, or refactor tests to use it uniformly. Low priority for V0.

**W4. Streaming usage tracking depends on upstream contract** — `nomos/src/chat-completions.js:137-143`

Token usage is only captured from `event.data.usage` in streaming chunks. If the upstream provider doesn't include usage in the final streaming chunk (some providers don't), usage is silently not logged. The non-streaming path (`extractUsage` at line 91-97) handles this correctly.

This is by design (best-effort logging), but could be documented.

Fix: Add a comment noting the upstream dependency, or log a debug-level message when stream completes without usage data.

**W5. Plan final gates partially unchecked** — `nomos/docs/plans/implemented/0001-nomos-v0-implementation.md:164-165`

Two final gates remain unchecked:
- `[ ] CI pipeline green on all checks`
- `[ ] Release pipeline: full e2e suite green`

These cannot be verified locally. They should be checked after the first successful CI/release run.

---

## Architecture Review

### Protocol Ownership — pass

All three business protocols defined in `chat-completions.js:1-18` (the client) via JSDoc:

| Protocol | Owner | Implementations |
|----------|-------|-----------------|
| Runner (`execute`, `executeStream`) | `chat-completions.js` | `live-runner.js`, `stub-runner.js` |
| Budget (`checkBudget`, `logUsage`) | `chat-completions.js` | `budget.js` |
| Safeguards (`scanMessages`, `reinforceMessages`) | `chat-completions.js` | `safeguards.js` |

No implementation imports the client. Fully compliant with "protocol owned by client" rule.

### Composition Root — pass

`server.js` is the single composition root:
- Loads config, creates logger, opens DB, initializes schema
- Creates services (runners, budget, safeguards) with injected dependencies
- Wires everything into `createApp()` → `app.listen()`
- Handles graceful shutdown (SIGTERM/SIGINT → close server → close DB)

No module knows about any other module. All cross-cutting flows through the composition root.

### Dependency Flow — pass

```
server.js (composition root)
├── config.js       (no deps)
├── logger.js       (no deps)
├── db.js           (no deps)
├── schema.js       (no deps)
├── live-runner.js   (no deps)
├── stub-runner.js   (no deps)
├── budget.js        (no deps)
├── safeguards.js    (no deps)
└── app.js           (imports auth.js, chat-completions.js)
    └── chat-completions.js (no deps — receives all services via injection)
```

No circular dependencies. `app.js` is the only module that imports siblings (auth + chat-completions), both wired via DI.

### CI Isolation — pass

- `nomos-core.yml` runs only nomos tests with nomos deps
- `ci.yml` dispatches to `nomos-core` via path filter on `nomos/**`
- `release.yml` runs the full suite independently

---

## Security Review

### Token Handling — pass
- SHA-256 hashing (`auth.js:3-5`), no plaintext storage
- Redaction masks all but first/last 4 chars (`auth.js:7-9`)
- Logs use `token_hash`, never raw token (`auth.js:29`)

### SQL Injection — pass
- All DB access uses parameterized prepared statements (`?` placeholders)
- No string interpolation in SQL

### Input Validation — pass
- `model` required: 400 if missing (`chat-completions.js:24-28`)
- `messages` required + array check: 400 if invalid (`chat-completions.js:30-34`)

### Container Security — pass
- Non-root user in Dockerfile
- `npm ci --production` (no dev deps)
- Health check configured
- No secrets baked into image

### Injection Prevention — pass (best-effort, as designed)
- 8 default regex patterns for common injection vectors (`safeguards.js:5-14`)
- Sanitization strips null bytes, zero-width chars, RTL overrides (`safeguards.js:19-23`)
- Configurable blocking mode, redacted audit logging

---

## Phase-by-Phase Summary

| Phase | Deliverables | Tests | Verdict |
|-------|-------------|-------|---------|
| 1. Scaffold | Express app, health, SQLite WAL, Docker, Caddy, CI | ~7 | **pass** |
| 2. Runner | StubRunner, fixtures, SSE events | 9 | **pass** |
| 3. Auth | Token hash/validate, scope enforcement, redaction | 11 | **pass** |
| 4. API Proxy | Routes, LiveRunner, SSE streaming, dispatch | 27 | **pass** |
| 5. Budget | Usage logging, budget check/enforce, reports | 28 | **pass** |
| 6. Safeguards | 8 patterns, sanitization, reinforcement, blocking | 36 | **pass** |

All phase deliverables match the plan. No missing items.

---

## Code Quality Summary

| Metric | Value |
|--------|-------|
| Source modules | 12 |
| Source lines | ~745 |
| Test files | 14 + 1 helpers + 3 fixtures |
| Test count | ~130 |
| Test lines | ~3,500 |
| Dependencies | 2 (express, better-sqlite3) |

The code is minimal, clean, and well-structured. Factory functions provide testability without framework overhead. No over-engineering. Consistent patterns across all modules.

---

## Action Items (ordered by priority)

1. **W1**: Add path traversal guard in StubRunner (low priority — stub is auth-gated and disabled by default)
2. **W4**: Document streaming usage tracking upstream dependency (comment only)
3. **W5**: Check plan final gates after first CI/release run
4. **W2**: Accept test helper duplication in app.test.js/health.test.js as intentional (no action needed)
5. **W3**: Decide on `cleanupTestDb()` usage consistency (optional cleanup)
