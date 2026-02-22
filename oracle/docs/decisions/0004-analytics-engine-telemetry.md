---
date: 2026-02-22
model: gpt-5.2
description: "Decision: store raw, text-free per-request telemetry in Workers Analytics Engine (tokens + per-call cost) with a stable event contract"
---

# Decision: Raw Telemetry in Workers Analytics Engine

## Status
Accepted (2026-02-22).

## Context
We need observability for:
- number of API requests and outcomes
- number of LLM calls and outcomes
- latency at the API and LLM layers
- token usage and actual spend per LLM call

Constraints:
- Prefer raw per-request attribution as the source of truth; rollups are derived views.
- Store no raw user text (text-free telemetry).
- Telemetry must be best-effort and must not affect API responses.
- Queries will be run in Cloudflare; local querying is not required.

## Decision
Store raw telemetry events in Cloudflare Workers Analytics Engine (AE).

Emit two event types (v1), both including `eventSchemaVersion=1`.

### Architecture fit
- Telemetry code lives in Worker composition/entrypoints (not in core modules).
- Telemetry is implemented via same-shape decorators around the LLM model clients.

#### Why
- Keep module boundaries intact (core modules stay Cloudflare-agnostic and portable).
- Add observability without changing client-owned protocols or core module inputs.

### Events
1. `llm_call` (0-2 per API request)
- Correlation: `requestId`
- Dimensions: `environment`, `client` (`normalizer|outlook`), `model`, `promptVersion` (null for normalizer), `schemaVersion`, `locale`
- Performance: `durationMs`
- Outcome: `status` (`ok|error`), `errorType` (`timeout|http_error|invalid_json|invalid_schema|invalid_response`), `httpStatus` (nullable)
- Usage: `promptTokens` (nullable), `completionTokens` (nullable), `totalTokens` (nullable), `usageSource` (`provider|missing`)
- Spend: `costMicrosUsd` (nullable), `costSource` (`provider|missing`)

2. `api_request` (exactly 1 per incoming request)
- Correlation: `requestId`
- Dimensions: `environment`, `route`, `method`, `schemaVersion`, `locale`
- Outcome: `statusCode`, `result` (`invalid_body|guard_reject|clarify|answered|error`), `durationMs`
- LLM totals (best-effort): `llmCalls`, `llmTotalTokens`, `llmCostMicrosUsd`, `llmTotalsCompleteness` (`complete|partial|missing`)

### Event contract rules
- `requestId` is correlation/debug only (not a query key).
- `environment` must equal the Worker `ENVIRONMENT` value.
- Generate `requestId` once per incoming request and reuse it for:
  - the API response, and
  - the `api_request` event, and
  - all `llm_call` events for that request.
- `route` is a low-cardinality route identifier (not a raw URL path).
- Emit `api_request` for every incoming request, including invalid JSON, guard rejects, clarification responses, answered responses, and internal errors.
- Emit `llm_call` for every attempted LLM call, including timeouts and other errors.
- `usageSource` indicates whether token usage values are provider-returned (`provider`) or missing (`missing`).
- `costSource` indicates whether cost values are provider-returned (`provider`) or missing (`missing`).
- `llmTotalsCompleteness` semantics:
  - `complete`: totals include all LLM calls and all calls had provider token+cost metadata.
  - `partial`: totals are a partial sum; at least one call is missing provider token and/or cost metadata.
  - `missing`: totals are missing because no call had provider token/cost metadata.

#### Why
- Enforce stable per-request correlation (`requestId`) while keeping cardinality under control.
- Make totals usable without being misleading (`llmTotalsCompleteness` makes partial sums explicit).

### Emission guarantees
- AE emission runs out-of-band where possible (e.g. Worker `waitUntil`) and failures are swallowed.
- Telemetry must never fail or delay the user-facing API response.
- Telemetry emission is prod-only by default: non-prod composition uses a no-op telemetry implementation.

#### Why
- Preserve user-facing latency and reliability (telemetry must not become a new failure mode).
- Avoid dev/preview noise and surprise costs while keeping production observability intact.

### Workers Analytics Engine setup
- Use a single AE dataset for all environments.
- Production Worker `env` must expose an AE dataset binding for telemetry writes.
- The Worker must provide an explicit `ENVIRONMENT` value (`prod|preview|dev`) for any emitted event.

#### Why
- Single dataset keeps provisioning simple; explicit environment keeps telemetry safe and filterable.

## Rationale
- AE matches the shape of telemetry (append-only, time-sliced, query-oriented) better than D1.
- Keeping raw events avoids hardcoding rollup definitions; rollups can evolve without reinterpreting history.
- Text-free telemetry controls cardinality and avoids storing user-provided content in observability systems.
- Per-call cost stored as provider-returned values stays historically correct under model and pricing changes.

## Consequences
- The Worker entrypoint must generate and propagate `requestId` to all LLM calls and telemetry events.
- Event field semantics must not change within a schema version. Additive changes are allowed; breaking changes require `eventSchemaVersion` bump.
- Some events may have `costMicrosUsd`/token usage missing (provider did not return them, or call errored). Queries should filter on `costSource='provider'` where needed.
- Telemetry decorators/adapters must be covered by tests in the composition layer.

## Non-goals
- Budget enforcement or rate limiting is not part of this decision.
- Storing user text (raw profession, clarifications, prompts, completions) in telemetry is prohibited.

## Alternatives considered
- Store raw telemetry in D1:
  - Pros: familiar SQL, easy joins with app data.
  - Cons: mixes app state with ops data, adds latency variance on the hot path, and makes retention/schema churn harder.
