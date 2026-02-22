---
date: 2026-02-22
model: gpt-5.2
description: "Implementation plan for decision 0004: emit text-free per-request telemetry into Workers Analytics Engine"
---

# Analytics Engine Telemetry Implementation Plan

## Architecture Conformance Verification
This plan is validated against:
- `oracle/docs/decisions/0002-composition-root-and-testing.md`
- `oracle/docs/composition-root-wiring-guide.md`
- `oracle/docs/am-i-done-architecture.md`
- `oracle/docs/decisions/0004-analytics-engine-telemetry.md`

Conformance checks:
1. Telemetry boundaries: telemetry lives in Worker entrypoints/composition only (no core-module changes).
Result: pass. Plan adds AE wiring in `am-i-done-api` + `worker-api` composition package only.
2. Client-owned protocols: no new shared protocol modules.
Result: pass. Plan wires telemetry via composition adapters/decorators and keeps client protocols untouched.
3. Best-effort emission: telemetry never delays or fails API responses.
Result: pass. Plan uses `ctx.waitUntil(...)` and swallows telemetry write failures.
4. Text-free telemetry: no raw user text or model text stored in events.
Result: pass. Plan emits only scalar metadata (durations, outcomes, tokens, cost) and prohibits raw strings like profession/prompt/completion; `requestId` is stored as a non-indexed blob for correlation only.

## Goal
Implement decision `0004-analytics-engine-telemetry` by emitting two v1 event types into Workers Analytics Engine:
- `api_request` (exactly 1 per incoming `/api/outlook` request)
- `llm_call` (0-2 per `/api/outlook` request, only when an actual OpenRouter call is attempted)

## Scope
In scope:
- Workers Analytics Engine dataset binding and prod-only emission policy.
- Stable event contract `eventSchemaVersion=1` and documented column mapping.
- `requestId` generated once per request and reused across response + all events.
- Composition-level tests for emission behavior, totals, and failure isolation.

Out of scope:
- Budget enforcement / rate limiting.
- Storing any user/model text in telemetry.
- Local telemetry querying tooling (Cloudflare querying only).

## Preflight Requirements (Blocking)
- Worktree required: yes
- Expected worktree: separate worktree for this plan (not main `ai-labs` worktree)
- Expected branch: `codex/*`
- Preflight check: [x] done (2026-02-22)
- Required preflight status line before Step 1:
- `Preflight: worktree=<path>, branch=<branch>, separate_worktree=<pass|fail>`
- If `separate_worktree=fail`, stop immediately and ask for direction. Do not continue implementation.

Preflight status (2026-02-22):
- `Preflight: worktree=/Users/igormalyarov/Developer/my-apps/ai-labs/ai-labs/worktrees/oracle-0009-telemetry-impl, branch=codex/oracle-0009-telemetry-impl, separate_worktree=pass`

## Execution Lock (Mandatory)
1. Run preflight and mark `Preflight check: [x] done` before Step 1.
2. Execute one plan step at a time; do not overlap step scopes.
3. For each step, reach green before proceeding:
   - run targeted tests for the step,
   - run full suite `./scripts/run_silent.sh "tests" npm test`,
   - proceed only if green.
4. When a step is green, create a step commit for implementation changes.
5. Self-review immediately after the step commit; fix any findings, re-run tests, and commit fixes.
6. Mark the implemented step as done in this plan and commit the plan tracker change.
7. After all steps are done, run final gates:
   - `./scripts/run_silent.sh "build" npx tsc --noEmit`
   - `./scripts/run_silent.sh "tests" npm test`
8. Move this plan file to `oracle/docs/plans/implemented/`, commit the move, then create a PR.

## Progress Tracker
- [x] Preflight check complete
- [x] Step 1 complete
- [x] Step 2 complete
- [x] Step 3 complete
- [x] Step 4 complete
- [x] Step 5 complete
- [ ] Final gates green
- [ ] Plan moved to `implemented/`
- [ ] PR created

## Step 1: Define AE Telemetry Contract and Writer
### Changes
- Add a composition-level telemetry module (new file) in `oracle/packages/worker-api/src/` that:
  - defines the v1 event contract for `api_request` and `llm_call` with `eventSchemaVersion=1`,
  - documents a stable Analytics Engine column mapping (which blob/double/index position corresponds to which field),
  - provides a single emission API that is safe-by-default:
    - schedules writes via `waitUntil` when available,
    - swallows write failures,
    - rejects/normalizes any attempt to include raw text fields.
- Add focused unit tests for:
  - stable column ordering for both event types,
  - emission failure isolation (writer throws, API still returns),
  - low-cardinality `route` rules (`api_outlook`, `health`, `not_found` if implemented).

### AE column mapping (v1)
Rules:
- All strings go to `indexes[]` unless explicitly stated otherwise.
- All numbers go to `doubles[]`.
- High-cardinality correlation `requestId` must not be an index; store it as a UTF-8 blob.
- Optional numeric fields use `0` when missing, and an accompanying `*Source`/completeness index field makes the missingness explicit (per decision `0004`).
- Optional string fields use `""` when missing/not applicable.

Shared fields:
- `indexes[0]`: `eventType` (`api_request|llm_call`)
- `indexes[1]`: `eventSchemaVersion` (`"1"`)
- `indexes[2]`: `environment` (`prod|preview|dev`)
- `blobs[0]`: `requestId` (UTF-8 bytes; correlation/debug only)

`api_request` fields:
- `indexes[3]`: `route` (low-cardinality identifier, e.g. `api_outlook`)
- `indexes[4]`: `method` (`GET|POST`)
- `indexes[5]`: `schemaVersion` (API schema version string, e.g. `"1"`)
- `indexes[6]`: `locale` (e.g. `en-US`)
- `indexes[7]`: `result` (`invalid_body|guard_reject|clarify|answered|error`)
- `indexes[8]`: `llmTotalsCompleteness` (`complete|partial|missing`)
- `doubles[0]`: `statusCode`
- `doubles[1]`: `durationMs`
- `doubles[2]`: `llmCalls`
- `doubles[3]`: `llmTotalTokens` (0 when missing/partial)
- `doubles[4]`: `llmCostMicrosUsd` (0 when missing/partial)

`llm_call` fields:
- `indexes[3]`: `client` (`normalizer|outlook`)
- `indexes[4]`: `model`
- `indexes[5]`: `promptVersion` (`""` represents null for normalizer)
- `indexes[6]`: `schemaVersion` (API schema version string, e.g. `"1"`)
- `indexes[7]`: `locale` (e.g. `en-US`)
- `indexes[8]`: `status` (`ok|error`)
- `indexes[9]`: `errorType` (`""` for ok; `timeout|http_error|invalid_json|invalid_schema|invalid_response`)
- `indexes[10]`: `usageSource` (`provider|missing`)
- `indexes[11]`: `costSource` (`provider|missing`)
- `doubles[0]`: `durationMs`
- `doubles[1]`: `httpStatus` (0 when not applicable/unknown)
- `doubles[2]`: `promptTokens` (0 when missing)
- `doubles[3]`: `completionTokens` (0 when missing)
- `doubles[4]`: `totalTokens` (0 when missing)
- `doubles[5]`: `costMicrosUsd` (0 when missing)

### Verification
- Targeted:
- `./scripts/run_silent.sh "tests" node --test oracle/packages/worker-api/tests/analytics-engine-telemetry.test.js`
- Full suite:
- `./scripts/run_silent.sh "tests" npm test`

### Commit
- `add ae telemetry contract`
- Then update this plan tracker (`Step 1 complete`) and commit the tracker change.

## Step 2: Wire Worker `ctx.waitUntil` and AE Dataset Binding
### Changes
- Update the Worker entrypoint to accept `ctx` and pass a `waitUntil` capability into the assembler:
  - `oracle/apps/am-i-done-api/src/index.js`
  - `oracle/apps/am-i-done-api/src/worker-fetch-assembler.js`
- Extend assembler config resolution to include:
  - `ENVIRONMENT` binding (`prod|preview|dev`) required for deterministic filtering in emitted events.
  - AE dataset binding (single dataset for all environments) required only when telemetry is enabled.
- Implement prod-only emission policy:
  - `ENVIRONMENT=prod` enables telemetry writes.
  - non-prod (`preview|dev`) uses no-op telemetry implementation.
- Update `oracle/apps/am-i-done-api/wrangler.toml`:
  - add `[vars] ENVIRONMENT = "dev"` (safe default for `wrangler dev`),
  - add `[[analytics_engine_datasets]]` with binding `TELEMETRY_DATASET` and dataset `am_i_done_telemetry`.
- Update `oracle/apps/am-i-done-api/.dev.vars.example` to include `ENVIRONMENT=dev`.
- Dataset provisioning:
  - Create the Analytics Engine dataset named `am_i_done_telemetry` in the Cloudflare account for production.
  - Production must fail-closed at assembly time if `ENVIRONMENT=prod` and `TELEMETRY_DATASET` binding is missing (non-prod remains no-op).

### Verification
- Targeted:
- `./scripts/run_silent.sh "tests" node --test oracle/apps/am-i-done-api/tests/worker-fetch-assembler.test.js`
- Full suite:
- `./scripts/run_silent.sh "tests" npm test`

### Commit
- `wire worker ctx and telemetry bindings`
- Then update this plan tracker (`Step 2 complete`) and commit the tracker change.

## Step 3: Stabilize `requestId` and Emit `api_request` Once Per Request
### Changes
- Update `oracle/packages/worker-api/src/worker-api.js` so:
  - `requestId` is generated exactly once per incoming `/api/outlook` request,
  - the same `requestId` is reused for:
    - the API response body, and
    - the `api_request` event emission.
- Add `api_request` emission for all `/api/outlook` outcomes, including:
  - invalid JSON body (`result=invalid_body`),
  - guard reject (`result=guard_reject`),
  - clarification success (`result=clarify`),
  - answered success (`result=answered`),
  - unexpected internal error (`result=error`, statusCode assumed `500` when no response is produced).
- Implementation note: wrap the whole handler body in `try/catch/finally` so `api_request` emission runs even when the handler throws; on throw, emit `result=error` + `statusCode=500` and then rethrow.
- Ensure emission is best-effort and cannot affect API responses (writer errors swallowed; `waitUntil` scheduling used when available).
- Extend composition tests in `oracle/packages/worker-api/tests/worker-api.composition.test.js` to assert:
  - `requestIdGenerator` is called once per request (not once per return path),
  - `api_request` is emitted once per request on each outcome category,
  - telemetry writer failures do not change the returned response.

### Verification
- Targeted:
- `./scripts/run_silent.sh "tests" node --test oracle/packages/worker-api/tests/worker-api.composition.test.js`
- Full suite:
- `./scripts/run_silent.sh "tests" npm test`

### Commit
- `emit api request telemetry`
- Then update this plan tracker (`Step 3 complete`) and commit the tracker change.

## Step 4: Emit `llm_call` Events and Compute API LLM Totals
### Changes
- Ensure `llm_call` is emitted only for attempted OpenRouter calls (no cache-hit noise).
- Add request-scoped LLM call accumulation to produce `api_request` totals:
  - `llmCalls`
  - `llmTotalTokens`
  - `llmCostMicrosUsd`
  - `llmTotalsCompleteness` (`complete|partial|missing`)
- Implement request-scoped correlation without changing core module protocols by:
  - creating request-scoped model clients (normalizer + outlook) that close over:
    - `requestId`, `schemaVersion`, `environment`, and an accumulator object,
  - instantiating the normalizer/outlook services per request using shared caches and these request-scoped model clients.
- Hard rule: telemetry correlation must not leak into model prompts.
  - The OpenRouter user message JSON must remain domain input only (no `requestId`, no telemetry fields).
  - Add/extend adapter tests to assert the request body does not include `requestId` (or any telemetry-only keys).
- Extend OpenRouter model client adapters to extract telemetry-relevant metadata for emission (composition-only) without changing their client-facing outputs:
  - `normalize()` and `generate()` must still resolve to the same domain objects they do today (no extra fields/tuples/metadata in return values).
  - classify errors into `timeout|http_error|invalid_json|invalid_schema|invalid_response`,
  - record `httpStatus` when the provider returns it,
  - extract provider usage where available (`promptTokens`, `completionTokens`, `totalTokens`) from the OpenRouter payload,
  - extract per-call cost where available and normalize to `costMicrosUsd`.
- Add/extend assembler tests in `oracle/apps/am-i-done-api/tests/worker-fetch-assembler.test.js` to cover:
  - `llm_call` count is `0` on cache-hit path, `2` on full-miss path.
  - `llmTotalsCompleteness` behavior across:
    - provider usage+cost present (`complete`),
    - partial metadata (`partial`),
    - no metadata (`missing`).
  - Telemetry failures (dataset throws) never change the API response.

### Verification
- Targeted:
- `./scripts/run_silent.sh "tests" node --test oracle/apps/am-i-done-api/tests/worker-fetch-assembler.test.js`
- `./scripts/run_silent.sh "tests" node --test oracle/packages/worker-api/tests/openrouter-normalizer-model-client-adapter.test.js`
- `./scripts/run_silent.sh "tests" node --test oracle/packages/worker-api/tests/openrouter-outlook-model-client-adapter.test.js`
- Full suite:
- `./scripts/run_silent.sh "tests" npm test`

### Commit
- `emit llm call telemetry`
- Then update this plan tracker (`Step 4 complete`) and commit the tracker change.

## Step 5: Update Specs, Inventory, and Runbook
### Changes
- Update composition docs to match the implemented wiring and new runtime inputs:
  - `oracle/docs/specs/implemented/worker-api-assembler.md` (add `ENVIRONMENT`, AE dataset binding, and `ctx.waitUntil` usage)
  - `oracle/docs/inventory/implemented-components.md` (list the new inputs and the prod-only emission rule)
- Ensure decision `0004` remains consistent with the implemented contract:
  - additive fields only without changing meaning under `eventSchemaVersion=1`,
  - any breaking change documented as `eventSchemaVersion` bump (not part of this plan).

### Verification
- Full suite:
- `./scripts/run_silent.sh "tests" npm test`

### Commit
- `document telemetry wiring`
- Then update this plan tracker (`Step 5 complete`) and commit the tracker change.

## Final Gates and Closeout
### Verification
- `./scripts/run_silent.sh "build" npx tsc --noEmit`
- `./scripts/run_silent.sh "tests" npm test`

### Closeout
- Move this plan to `oracle/docs/plans/implemented/` and commit the move.
- Create a PR for review.

## Done Criteria
- `requestId` is generated once per request and reused across response + telemetry.
- Exactly one `api_request` event is emitted per `/api/outlook` request, covering all outcomes.
- `llm_call` events are emitted only for real OpenRouter attempts (0-2 per request).
- Telemetry is prod-only by default and best-effort (cannot delay or fail responses).
- Event contract is stable under `eventSchemaVersion=1` with documented AE column mapping.
- Full test suite and build gate pass.
