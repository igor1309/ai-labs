---
date: 2026-02-21
model: gpt-5
description: "Inventory of implemented modules, adapters, wiring points, tests, and Cloudflare bindings"
---

# Inventory: Implemented Modules and Adapters

## Scope snapshot
- App entrypoint: `oracle/apps/am-i-done-api/src/index.js`
- Worker runtime config: `oracle/apps/am-i-done-api/wrangler.toml`
- Worker assembly/composition package: `oracle/packages/worker-api/src/*.js`
- Domain modules:
- `oracle/packages/profession-normalizer/src/profession-normalizer.js`
- `oracle/packages/profession-outlook/src/profession-outlook.js`
- Migration for D1 counters/synonyms tables: `oracle/apps/am-i-done-api/migrations/0001_init.sql`
- Test command: `./scripts/run_silent.sh "tests" npm test`

## Implemented components

### Modules

#### `profession-normalizer` (module)
- Source: `oracle/packages/profession-normalizer/src/profession-normalizer.js`
- Public API:
- `professionNormalizer.normalize(input) -> Promise<NormalizerResult>` (configured singleton)
- `configureProfessionNormalizer({ cache, modelClient }) -> void`
- `createProfessionNormalizer({ cache, modelClient }) -> { normalize(...) }`
- `normalizeProfession(profession) -> string` (trim + collapse whitespace)
- Owned protocol shapes:
- `NormalizerCache.read(key)`, `NormalizerCache.write(key, value)`
- `NormalizerModelClient.normalize({ locale, profession })`
- Cache key policy:
- `normalizer:${locale}:${normalizedProfession}`
- Wiring point:
- Created in assembler via `createProfessionNormalizer({...})` inside `makeWorkerFetch(...)`.
- Tests:
- `oracle/packages/profession-normalizer/tests/profession-normalizer.test.js`
- Asserts dependency validation, configured singleton delegation, cache hit/miss behavior, cache keying, normalization helper behavior, clarification-result passthrough.

#### `profession-outlook` (module)
- Source: `oracle/packages/profession-outlook/src/profession-outlook.js`
- Public API:
- `createProfessionOutlookService({ cache, modelClient, promptVersion }) -> { getOutlook(...) }`
- `getOutlook(input) -> Promise<OutlookAnswer>`
- Owned protocol shapes:
- `OutlookCache.read(key)`, `OutlookCache.write(key, value)`
- `OutlookModelClient.generate({ canonicalProfession, locale, schemaVersion, promptVersion, hints? })`
- Cache key policy:
- `outlook:${canonicalProfession}:${locale}:${schemaVersion}:${promptVersion}`
- Wiring point:
- Created in assembler via `createProfessionOutlookService({...})` inside `makeWorkerFetch(...)`.
- Tests:
- `oracle/packages/profession-outlook/tests/profession-outlook.test.js`
- Asserts dependency validation, cache hit/miss behavior, key composition, promptVersion + hints propagation, unknown field filtering, null/undefined miss handling.

### Worker-owned components (router/composition/guard)

#### `requestGuard` (worker-api component)
- Source: `oracle/packages/worker-api/src/request-guard.js`
- Public API:
- `requestGuard.validate(input) -> Promise<GuardResult>`
- Contract:
- Non-throwing validation for unknown input shapes.
- Valid path returns trimmed `{ profession, locale, schemaVersion }`.
- Invalid path returns clarification message and empty suggestions.
- Wiring point:
- Injected directly into `createWorkerFetchHandler(...)` by assembler.
- Tests:
- `oracle/packages/worker-api/tests/request-guard.test.js`
- Asserts all invalid-shape/field cases, schemaVersion defaulting, trimming, non-throwing behavior (including throwing getter objects).

#### `createWorkerFetchHandler` (composition wiring)
- Source: `oracle/packages/worker-api/src/worker-api.js`
- Public API:
- `createWorkerFetchHandler({ requestGuard, professionNormalizer, professionOutlookService, popularityCountersStore, requestIdGenerator }) -> fetch(request)`
- Contract:
- Parses request JSON for `/api/outlook`.
- Returns structured clarification response on JSON parse failure or guard/normalizer clarification.
- On canonical flow: increments counters, queries outlook service, returns structured answer response.
- Wiring point:
- Assembled by `makeWorkerFetch(...)`, then wrapped by entrypoint router.
- Tests:
- `oracle/packages/worker-api/tests/worker-api.composition.test.js`
- Asserts dependency validation, call ordering, invalid JSON behavior, guard invalid behavior, normalizer clarification behavior, increment call, final response shape.

#### `createWorkerApiEntrypointRouter` (HTTP entrypoint router)
- Source: `oracle/packages/worker-api/src/worker-api.js`
- Public API:
- `createWorkerApiEntrypointRouter({ outlookHandler }) -> fetch(request)`
- Routes:
- `GET /health` -> `200` + `ok`
- `POST /api/outlook` -> delegates to `outlookHandler`
- default -> `404`
- Wiring point:
- Final step in `makeWorkerFetch(...)`; app entrypoint exports this composed fetch.
- Tests:
- `oracle/packages/worker-api/tests/worker-api-entrypoint-router.test.js`
- Asserts dependency validation, `/health`, `/api/outlook` delegation, `404` fallback, and composed invalid-JSON clarification behavior.

### Adapters

#### `createCloudflareKvJsonCacheAdapter`
- Source: `oracle/packages/worker-api/src/cloudflare-kv-json-cache-adapter.js`
- Public API:
- `createCloudflareKvJsonCacheAdapter({ kv }) -> { read(key), write(key, value) }`
- Cloudflare dependency:
- `kv.get(key)`, `kv.put(key, value)` (KV namespace binding)
- Behavior:
- `read`: returns `null` on miss or invalid JSON; parsed JSON on hit.
- `write`: `JSON.stringify` then `put`.
- Wiring point:
- Instantiated twice in assembler: `NORMALIZER_CACHE`, `OUTLOOK_CACHE`.
- Tests:
- `oracle/packages/worker-api/tests/cloudflare-kv-json-cache-adapter.test.js`
- Asserts dependency validation, miss/hit/invalid JSON behavior, serialized writes.

#### `createOpenRouterNormalizerModelClient`
- Source: `oracle/packages/worker-api/src/openrouter-normalizer-model-client-adapter.js`
- Public API:
- `createOpenRouterNormalizerModelClient({ apiKey, baseUrl, httpClient, model, timeoutMs }) -> { normalize(input) }`
- External dependency:
- OpenRouter HTTP endpoint `/api/v1/chat/completions`.
- Behavior:
- Sends strict JSON response-format request.
- Uses system + user prompt including `profession`, `locale`.
- Parses and validates result shape for clarification/canonical variants.
- Aborts on timeout, throws explicit timeout/http/schema errors.
- Wiring point:
- Instantiated by assembler with `OPENROUTER_API_KEY`, `NORMALIZER_MODEL`, `OPENROUTER_BASE_URL`, `OPENROUTER_TIMEOUT_MS`.
- Tests:
- `oracle/packages/worker-api/tests/openrouter-normalizer-model-client-adapter.test.js`
- Asserts dependency validation, request payload config propagation, JSON parsing, schema validation failures, OpenRouter non-OK error mapping, timeout behavior.

#### `createOpenRouterOutlookModelClient`
- Source: `oracle/packages/worker-api/src/openrouter-outlook-model-client-adapter.js`
- Public API:
- `createOpenRouterOutlookModelClient({ apiKey, baseUrl, httpClient, model, timeoutMs }) -> { generate(input) }`
- External dependency:
- OpenRouter HTTP endpoint `/api/v1/chat/completions`.
- Behavior:
- Sends strict JSON response-format request.
- Includes canonical profession/locale/schemaVersion/promptVersion/hints in user prompt.
- Validates fixed `OutlookAnswer` shape.
- Aborts on timeout, throws explicit timeout/http/schema errors.
- Wiring point:
- Instantiated by assembler with `OPENROUTER_API_KEY`, `OUTLOOK_MODEL`, `OPENROUTER_BASE_URL`, `OPENROUTER_TIMEOUT_MS`.
- Tests:
- `oracle/packages/worker-api/tests/openrouter-outlook-model-client-adapter.test.js`
- Asserts dependency validation, prompt + payload content, schema checks, JSON-only enforcement, OpenRouter error mapping, timeout behavior.

#### `createPopularityCountersStore` (D1 adapter)
- Source: `oracle/packages/worker-api/src/popularity-counters-store.js`
- Public API:
- `createPopularityCountersStore({ db, now? }) -> { increment(canonicalProfession) }`
- Cloudflare dependency:
- D1 `db.prepare(...).bind(...).run()`
- Behavior:
- Validates non-empty trimmed canonical profession.
- Performs atomic upsert into `profession_counters`.
- Wiring point:
- Instantiated by assembler from `env.DB`.
- Tests:
- `oracle/packages/worker-api/tests/popularity-counters-store.test.js`
- Asserts dependency validation, upsert statement usage, bound parameters, empty profession rejection.

### Assembler and app entrypoint

#### `makeWorkerFetch` (assembler)
- Source: `oracle/packages/worker-api/src/worker-api-assembler.js`
- Public API:
- `makeWorkerFetch(env, { httpClient = fetch, requestIdGenerator = defaultRequestIdGenerator } = {}) -> fetch(request)`
- Responsibilities implemented:
- Validates required bindings.
- Resolves optional config defaults.
- Builds adapters and modules, wires composition handler, wraps with entrypoint router.
- Default config:
- `NORMALIZER_MODEL`: `openai/gpt-4o-mini`
- `OUTLOOK_MODEL`: `openai/gpt-4o-mini`
- `OPENROUTER_BASE_URL`: `https://openrouter.ai`
- `OPENROUTER_TIMEOUT_MS`: `10000`
- `PROMPT_VERSION`: `"1"`
- Tests:
- `oracle/packages/worker-api/tests/worker-api-assembler.test.js`
- Asserts missing/invalid binding failures, config defaulting, routing for method/path, OpenRouter/KV/D1 wiring behavior, fallback request-id generation.

#### Cloudflare Worker app entrypoint
- Source: `oracle/apps/am-i-done-api/src/index.js`
- Public API:
- default export `{ fetch(request, env) }`
- Behavior:
- Delegates to `makeWorkerFetch(env)` and executes returned fetch.
- Runtime config:
- `oracle/apps/am-i-done-api/wrangler.toml`

## Cloudflare bindings map

| Binding | Required | Used by | Purpose |
| --- | --- | --- | --- |
| `NORMALIZER_CACHE` | Yes | `createCloudflareKvJsonCacheAdapter` for normalizer | Normalizer cache storage |
| `OUTLOOK_CACHE` | Yes | `createCloudflareKvJsonCacheAdapter` for outlook | Outlook answer cache storage |
| `DB` | Yes | `createPopularityCountersStore` | D1 counters persistence |
| `OPENROUTER_API_KEY` | Yes | Both OpenRouter adapters | Auth for model calls |
| `PROMPT_VERSION` | No (defaults to `"1"`) | `createProfessionOutlookService` via assembler config | Cache/prompt versioning |
| `NORMALIZER_MODEL` | No | OpenRouter normalizer adapter | Model selection |
| `OUTLOOK_MODEL` | No | OpenRouter outlook adapter | Model selection |
| `OPENROUTER_BASE_URL` | No | Both OpenRouter adapters | Endpoint override |
| `OPENROUTER_TIMEOUT_MS` | No | Both OpenRouter adapters | Timeout tuning |

## Test inventory and execution
- Full suite command: `./scripts/run_silent.sh "tests" npm test`
- Coverage by component:
- Modules: `profession-normalizer`, `profession-outlook`
- Worker-owned router/composition/guard: `worker-api.js`, `request-guard.js`
- Adapters: KV JSON cache, OpenRouter normalizer, OpenRouter outlook, D1 counters store
- Assembler: env binding validation, config propagation, runtime wiring
- Entrypoint behavior: composed routing and invalid JSON response flow

## Spec drift notes
- `worker-api-assembler` spec marks `env.PROMPT_VERSION` under required inputs while also documenting default `"1"` behavior; implementation treats it as optional and defaults to `"1"` when missing/blank.
- Implemented adapters include stricter runtime checks than minimum specs (empty API key/model, invalid timeout, non-OK OpenRouter status formatting, timeout abort), which is additive hardening.
- Architecture drift: `PopularityTracker` decorator behavior is not implemented. The architecture doc requires incrementing counters on every request (cache hit or miss), while current composition increments only on canonical (non-clarification) flow.

## Ready-to-assemble checklist
- [x] Module-owned protocols are defined in their owning modules (`profession-normalizer`, `profession-outlook`).
- [x] Worker-owned components (`requestGuard`, composition handler, entrypoint router) are implemented and tested.
- [x] Cloudflare adapters (KV, D1, OpenRouter) are implemented and assembler-wired.
- [x] App entrypoint delegates to assembler-generated fetch.
- [ ] `PopularityTracker` behavior from architecture is not yet implemented (increment counters on every request, including clarification/cache-hit paths).
- [ ] Cloudflare secret `OPENROUTER_API_KEY` must be provisioned in target environment.
- [ ] D1 migration `oracle/apps/am-i-done-api/migrations/0001_init.sql` must be applied in target environment.
- [ ] Optional runtime overrides (`NORMALIZER_MODEL`, `OUTLOOK_MODEL`, `OPENROUTER_BASE_URL`, `OPENROUTER_TIMEOUT_MS`, `PROMPT_VERSION`) should be explicitly set per deployment policy.

## References
- `oracle/docs/specs/implemented/profession-normalizer.md`
- `oracle/docs/specs/implemented/profession-outlook.md`
- `oracle/docs/specs/implemented/request-guard.md`
- `oracle/docs/specs/implemented/cloudflare-kv-json-cache-adapter.md`
- `oracle/docs/specs/implemented/openrouter-normalizer-model-client-adapter.md`
- `oracle/docs/specs/implemented/openrouter-outlook-model-client-adapter.md`
- `oracle/docs/specs/implemented/popularity-counters-store.md`
- `oracle/docs/specs/implemented/worker-api-entrypoint-router.md`
- `oracle/docs/specs/implemented/worker-api-assembler.md`
