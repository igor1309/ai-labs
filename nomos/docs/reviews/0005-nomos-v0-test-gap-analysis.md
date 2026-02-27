# Nomos V0 Test Suite Gap Analysis

Date: 2026-02-27
Context: After fourth-pass review (0004) and fixing its F1, F2, W1–W4 findings.
Current score: 8/10 (147 tests, 0 failures)
Goal: Identify all remaining gaps to reach 10/10.

---

## Summary

64 untested code paths identified across all modules. Organized into three tiers by impact.

---

## Tier 1 — Highest value (8/10 → 9/10)

### `config.js` — entirely untested (14 gaps)

No test file exists. Every default value, type coercion, and the trailing-slash stripping have zero assertions.

| Source location | Untested behavior | Suggested test |
|---|---|---|
| `config.js:3` | `port` defaults to `8080` when `NOMOS_PORT` is unset | `loadConfig returns port 8080 by default` |
| `config.js:3` | `port` parses custom `NOMOS_PORT` to integer | `loadConfig parses NOMOS_PORT from env` |
| `config.js:4` | `host` defaults to `0.0.0.0` | `loadConfig returns host 0.0.0.0 by default` |
| `config.js:5` | `dbPath` defaults to `data/nomos.db` | `loadConfig returns default dbPath` |
| `config.js:6` | `env` defaults to `development` | `loadConfig returns development env by default` |
| `config.js:7` | `stubEnabled` is `true` only when env is literally `"true"` | `loadConfig stubEnabled false by default, true when "true"` |
| `config.js:8` | `vendorBaseUrl` strips trailing slashes | `loadConfig strips trailing slashes from vendorBaseUrl` |
| `config.js:9` | `vendorTimeoutMs` defaults to `30000` and parses integer | `loadConfig parses vendorTimeoutMs from env` |
| `config.js:10` | `vendorApiKey` defaults to `""` | `loadConfig returns empty vendorApiKey by default` |
| `config.js:11` | `fixturesDir` defaults to `tests/fixtures` | `loadConfig returns default fixturesDir` |
| `config.js:12` | `safeguardsEnabled` defaults true (`!== "false"`) | `loadConfig safeguardsEnabled defaults true` |
| `config.js:13` | `safeguardsSanitize` defaults true | `loadConfig safeguardsSanitize defaults true` |
| `config.js:14` | `safeguardsReinforce` false unless `"true"` | `loadConfig safeguardsReinforce defaults false` |
| `config.js:15-17` | `safeguardsBlockOnDetect`, prepend, append defaults | `loadConfig safeguard config defaults` |

### `app.js` error handler branches (4 gaps)

The error handler was just added (F1 fix) but only the body-parser 400 path is exercised.

| Source location | Untested behavior | Suggested test |
|---|---|---|
| `app.js:51` | 5xx errors return `"internal server error"` (not the real message) | `error handler hides message for 5xx errors` |
| `app.js:48` | `err.statusCode` fallback when `err.status` is absent | `error handler reads err.statusCode when err.status is undefined` |
| `app.js:48` | Errors without status default to 500 | `error handler defaults to 500 for errors without status` |
| `app.js:29-31` | `liveRunner=null` → POST `/v1/chat/completions` → JSON 404 | `POST /v1/chat/completions returns 404 when no liveRunner` |

### `live-runner.js` SSE parsing edge cases (4 gaps)

| Source location | Untested behavior | Suggested test |
|---|---|---|
| `live-runner.js:81-83` | Malformed JSON in SSE data lines silently skipped | `executeStream skips malformed JSON SSE lines` |
| `live-runner.js:73` | Non-data SSE lines (comments, blanks) are skipped | `executeStream ignores non-data SSE lines` |
| `live-runner.js:59-69` | Buffer accumulation across partial reads (data split across chunks) | `executeStream handles data split across read chunks` |
| `live-runner.js:25-30` | Vendor JSON error without `.error.message` → fallback message | `execute uses "upstream <status>" when error JSON has no message` |

---

## Tier 2 — Medium value (9/10 → 10/10)

### `logger.js` — entirely untested (3 gaps)

| Source location | Untested behavior | Suggested test |
|---|---|---|
| `logger.js:2-5` | Writes JSON with `level`, `msg`, `ts`, spread `data` to stdout | `logger.info writes JSON line to stdout` |
| `logger.js:3` | `ts` is valid ISO 8601 | `logger output ts is ISO 8601` |
| `logger.js:8-13` | `info`/`warn`/`error` set correct level; `data` defaults to `{}` | `logger levels are correct` |

### `chat-completions.js` guard clause coverage (6 gaps)

| Source location | Untested behavior | Suggested test |
|---|---|---|
| `chat-completions.js:37-38` | Budget check skipped when `budgetService` is null | `handler skips budget check when budgetService is null` |
| `chat-completions.js:37-38` | Budget check skipped when `req.project` is undefined | `handler skips budget check when req.project is undefined` |
| `chat-completions.js:104-105` | Usage logging skipped when `projectId` is falsy | `non-streaming: no usage logged when projectId is undefined` |
| `chat-completions.js:159` | Streaming usage not logged when `streamUsage` is null | `streaming: no usage logged when stream has no usage data` |
| `chat-completions.js:140-145` | Streaming usage captured from last chunk with usage | `streaming: usage captured from last chunk containing usage` |
| `chat-completions.js:117-122` | Non-streaming error: logger called with model name | `non-streaming runner error logs model name` |

### Cross-module integration (3 gaps)

| Source location | Untested behavior | Suggested test |
|---|---|---|
| `app.js` + all modules | Full flow: auth → budget → safeguards → runner → usage log | `full-stack request through createApp with all features` |
| `chat-completions.js:37-54,58-79` | Budget rejection happens before safeguard scan | `budget rejection returns 429 before safeguards execute` |
| `app.js:36` + safeguards | Stub endpoint with safeguards blocking injection | `stub endpoint blocks injection when blockOnDetect is true` |

### `safeguards.js` edge cases (4 gaps)

| Source location | Untested behavior | Suggested test |
|---|---|---|
| `safeguards.js:31` | `redactContent` with non-string truthy input (number) | `redactContent returns "***" for non-string types` |
| `safeguards.js:49-51` | Non-string `content` skips pattern matching and sanitization | `scanMessages skips non-string content` |
| `safeguards.js:64-65` | Sanitize disabled but detection enabled: patterns run, sanitization skipped | `scanMessages detects but skips sanitize when sanitize disabled` |
| `safeguards.js:86,94-98` | `reinforceMessages` does not mutate original array | `reinforceMessages does not mutate original array` |

---

## Tier 3 — Low value (completionism)

### `server.js` — startup and shutdown (3 gaps)

| Source location | Untested behavior | Suggested test |
|---|---|---|
| `server.js:16-24` | `liveRunner` null when `vendorBaseUrl` empty; Authorization header conditional | Hard to test without process-level isolation |
| `server.js:47-54` | `shutdown()` closes server then DB | Hard to test; container SIGKILL handles in practice |
| `server.js:56-57` | SIGTERM/SIGINT trigger shutdown | Requires process signal simulation |

### `budget.js` minor (1 gap)

| Source location | Untested behavior | Suggested test |
|---|---|---|
| `budget.js:56` | `periodExpired` returns false for unknown period (prevented by DB CHECK) | `periodExpired returns false for unrecognized period` |

### `app.js` unreachable guards (2 gaps)

| Source location | Untested behavior | Suggested test |
|---|---|---|
| `app.js:20-22` | `/v1/usage` returns 400 when `req.project.id` falsy (unreachable: auth always sets it) | Low value |
| `app.js:34` | `stubEnabled=true` but `stubRunner=null` → 404 | Edge case unlikely in production |

---

## Shortest path to 10/10

**~180 lines of new test code across 4 files:**

| Action | New tests | Lines |
|--------|-----------|-------|
| New `config.test.js` | 5 tests covering all defaults and coercions | ~50 |
| New `logger.test.js` | 3 tests covering JSON format, levels, timestamps | ~30 |
| Expand `routing.test.js` | error handler branches, null-liveRunner 404, full-stack integration | ~60 |
| Expand `live-runner.test.js` | malformed SSE, partial buffer, fallback error message | ~40 |

Tier 1 + Tier 2 gets to 10/10. Tier 3 is optional (unreachable/hard-to-test paths).
