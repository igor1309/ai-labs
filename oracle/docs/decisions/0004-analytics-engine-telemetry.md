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

Emit two event types (v1), both including `eventSchemaVersion=1`:

1. `llm_call` (0-2 per API request)
- Correlation: `requestId`
- Dimensions: `client` (`normalizer|outlook`), `model`, `promptVersion` (null for normalizer), `schemaVersion`, `locale`
- Performance: `durationMs`
- Outcome: `status` (`ok|error`), `errorType` (`timeout|http_error|invalid_json|invalid_schema|invalid_response`), `httpStatus` (nullable)
- Usage: `promptTokens` (nullable), `completionTokens` (nullable), `totalTokens` (nullable)
- Spend: `costMicrosUsd` (nullable), `costSource` (`provider|missing`)

2. `api_request` (exactly 1 per incoming request)
- Correlation: `requestId`
- Dimensions: `route`, `method`, `schemaVersion`, `locale`
- Outcome: `statusCode`, `result` (`invalid_body|guard_reject|clarify|answered|error`), `durationMs`
- Convenience totals (optional but supported by v1): `llmCalls`, `llmTotalTokens`, `llmCostMicrosUsd`

Telemetry writes are best-effort:
- AE emission runs out-of-band where possible (e.g. Worker `waitUntil`) and failures are swallowed.
- Telemetry must never fail or delay the user-facing API response.

## Rationale
- AE matches the shape of telemetry (append-only, time-sliced, query-oriented) better than D1.
- Keeping raw events avoids hardcoding rollup definitions; rollups can evolve without reinterpreting history.
- Text-free telemetry controls cardinality and avoids storing user-provided content in observability systems.
- Per-call cost stored as provider-returned values stays historically correct under model and pricing changes.

## Consequences
- The Worker entrypoint must generate and propagate `requestId` to all LLM calls and telemetry events.
- Event field semantics must not change within a schema version. Additive changes are allowed; breaking changes require `eventSchemaVersion` bump.
- Some events may have `costMicrosUsd`/token usage missing (provider did not return them, or call errored). Queries should filter on `costSource='provider'` where needed.

## Non-goals
- Budget enforcement or rate limiting is not part of this decision.
- Storing user text (raw profession, clarifications, prompts, completions) in telemetry is prohibited.

## Alternatives considered
- Store raw telemetry in D1:
  - Pros: familiar SQL, easy joins with app data.
  - Cons: mixes app state with ops data, adds latency variance on the hot path, and makes retention/schema churn harder.
