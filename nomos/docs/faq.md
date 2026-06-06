---
date: 2026-06-06
model: gpt-5
description: "Nomos FAQ covering current client/provider/model selection boundaries"
---

# Nomos FAQ

## Can a client select a provider?

Not in Nomos V0.

Nomos selects the outbound runner by endpoint namespace:

- `/v1/*` uses the live runner.
- `/stub/v1/*` uses the stub runner when enabled.

Project tokens carry only route scope (`live` or `stub`). They do not carry provider routing rules.

## Can a client select a vendor?

No.

The live upstream vendor is operational configuration on the Nomos service:

- `NOMOS_VENDOR_BASE_URL`
- `NOMOS_VENDOR_API_KEY`
- `NOMOS_VENDOR_TIMEOUT_MS`

Clients should call Nomos rather than binding directly to vendor base URLs or vendor credentials.

## Can a client select a model?

Yes.

The OpenAI-compatible chat completion request must include a `model` field. Nomos forwards that model string to the configured runner and records usage against the same model string when the provider returns usage metadata.

Nomos V0 does not maintain an allowlist, catalog, alias map, or entitlement table for model names.

## Can a client select a model type, such as a free model?

Only indirectly.

A client can request a concrete model ID that represents a free model if the configured upstream vendor supports it. Nomos V0 does not expose first-class selectors such as `free`, `cheap`, `best`, or `coding`.

The repo has a helper skill for discovering the current best free OpenRouter model from `https://shir-man.com/api/free-llm/top-models`, but Nomos does not call that ranking service itself.

## Can a client ask for subscription-based model access instead of API token pricing?

No.

Nomos V0 budgets are token-count budgets. They support daily or monthly token limits per project and return a hard stop when the budget is exhausted.

Nomos V0 does not model:

- provider price tables
- subscription entitlements
- user subscription pools
- model availability by subscription plan
- cost-based routing decisions

## When a client is wired to Nomos, is it just an API key?

Client-side wiring is more than a raw key:

- Nomos base URL
- project bearer token
- request payload, including `model`

Nomos-side wiring includes:

- project row with hashed token, scope, and active state
- optional project budget row
- upstream vendor environment configuration
- prompt safeguard configuration
- JSON body limit configuration
- stub route configuration for non-production usage

## Does Nomos fall back to other models on budget exhaustion?

No.

When a project budget is exhausted, Nomos returns `429` with `budget_exceeded`. It does not currently try another model, reserve backup models, or hold back a fallback chain.

## Future Policy Candidates

These are plausible future Nomos policies, but they are not current V0 behavior:

- model aliases such as `free`, `cheap`, or `best`
- per-project model allowlists
- per-project vendor routing
- fallback chains for upstream outages
- free-model discovery via OpenRouter ranking metadata
- subscription entitlement tracking
- cost-aware routing based on provider price tables
