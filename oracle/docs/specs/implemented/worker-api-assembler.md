---
date: 2026-02-22
model: gpt-5.2
description: "Spec: worker-api assemblers (Cloudflare env bindings -> adapters -> wiring composer -> fetch handler), including prod-only Analytics Engine telemetry"
---

# Spec: Worker API Assemblers (v1)

## Goal
Assemble a deployable Cloudflare Worker `fetch` handler by:
1) creating concrete adapters from Cloudflare `env` bindings and config,
2) plugging those adapters into wiring composers (interface-only),
3) returning the final entrypoint.

Assemblers are allowed to know all modules and providers. They must not contain business logic.

## Inputs
### Cloudflare `env` bindings
Required:
- `env.ENVIRONMENT`: `"prod" | "preview" | "dev"`
- `env.NORMALIZER_CACHE`: KV namespace for normalizer cache
- `env.OUTLOOK_CACHE`: KV namespace for outlook cache
- `env.DB`: D1 database binding
- `env.OPENROUTER_API_KEY`: secret (string)

Prod-only required:
- `env.TELEMETRY_DATASET`: Analytics Engine dataset binding used for best-effort per-request telemetry

Optional (v1 defaults may be provided by the assembler):
- `env.PROMPT_VERSION`: string (default `"1"` in config)
- `env.NORMALIZER_MODEL`: OpenRouter model id
- `env.OUTLOOK_MODEL`: OpenRouter model id
- `env.OPENROUTER_BASE_URL`: override base URL
- `env.OPENROUTER_TIMEOUT_MS`: number as string

### Cloudflare `ctx` capabilities
Optional:
- `ctx.waitUntil(promise)`: used to schedule telemetry writes without delaying responses.

### Wiring composer entrypoint
The assembler uses the `worker-api` wiring composer (interface-only) with dependency shape:
- `requestGuard.validate(input) -> guardResult`
- `makeProfessionNormalizer({ requestId, schemaVersion, locale, llmCallAccumulator }) -> { normalize(...) }`
- `makeProfessionOutlookService({ requestId, schemaVersion, locale, llmCallAccumulator }) -> { getOutlook(...) }`
- `popularityTracker.track({ rawProfession, normalizerResult }) -> void`
- `requestIdGenerator() -> string`
- `telemetry.emitApiRequest(event) -> void` (prod-only)
- `telemetry.emitLlmCall(event) -> void` (prod-only)

## Assembly outputs
- `fetch(request)` handler suitable for Worker runtime.

## Assembly responsibilities
The assembler must:
- Provide a concrete `requestGuard` implementation (pure validation, no throws).
- Provide a concrete `requestIdGenerator` (prefer `globalThis.crypto.randomUUID`).
- Create a KV JSON cache adapter for each cache dependency required by client modules.
- Create OpenRouter model client adapters for:
  - `profession-normalizer` model client protocol
  - `profession-outlook` model client protocol
- Create D1 counter store adapters for canonical and raw-input counters.
- Compose a `popularityTracker` decorator from these stores.
- Instantiate client modules (`profession-normalizer`, `profession-outlook`) per request using request-scoped model clients so LLM telemetry can correlate with a single `requestId`.
- Plug everything into the wiring composer to produce the final handler.
- In prod (`ENVIRONMENT=prod`), create an Analytics Engine telemetry writer using `TELEMETRY_DATASET` and `ctx.waitUntil`.

## Non-responsibilities
The assembler must not:
- define cache keys or caching policy (module-owned)
- normalize profession strings (module-owned)
- implement domain decisions (module-owned)

## Tests (required)
Assembler tests validate concrete binding and adapter wiring (not business behavior):
- Given a fake `env` with KV/D1 spies and a fake `fetch` spy for OpenRouter calls:
  - Assembled handler routes `/api/outlook` through wiring composer with correct dependency shapes.
  - Assembled adapters call KV/D1 with expected methods.
  - OpenRouter adapters receive the configured model ids, timeouts, and base URL.
  - In `ENVIRONMENT=prod`, assembled telemetry writes are best-effort and do not affect responses.
- Verify missing required bindings fail fast with clear errors at assembly time.

## Done criteria
- A documented assembler entrypoint exists (e.g., `makeWorkerFetch(env)`).
- Assembly uses only adapters/decorators/wiring composers, no domain logic.
- Assembler tests cover binding presence, adapter wiring, and config propagation.
