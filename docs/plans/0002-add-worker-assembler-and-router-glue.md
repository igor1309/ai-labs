---
date: 2026-02-21
model: gpt-5.2
description: "Implementation plan: add Worker assembler + router glue (env -> adapters -> wiring -> fetch)"
---

# Add Worker assembler + router glue

## Goal
Turn the deployed Worker service from a stub into a real entrypoint by adding:
- an assembler that converts Cloudflare `env` bindings into module-owned protocol implementations (adapters),
- a router that exposes `/health` and delegates `/api/outlook` to the assembled wiring composer handler.

Assembler and router must contain no domain/business logic: only adapter/decorator creation, config propagation, and delegation.

## Deliverables
- `oracle/apps/am-i-done-api/src/index.js` updated to use router + assembled handler (no longer returns 501 for `/api/outlook`).
- `oracle/packages/worker-api/src/worker-api.js` remains the wiring composer (interface-only).
- New assembler module(s) under `oracle/apps/am-i-done-api/src/` (file names TBD by implementation), implementing:
  - KV JSON cache adapter(s)
  - D1 popularity counters store adapter
  - OpenRouter normalizer/outlook model client adapters
  - module instance creation for `profession-normalizer` and `profession-outlook`
  - final `makeWorkerFetch(env)` (or equivalent) that returns `fetch`.
- Assembler/router tests (spy-based) in `oracle/apps/am-i-done-api/` test folder (or the repo’s established test location).

## Steps
1. Inventory current implementation surfaces
   - Confirm where the implemented modules live and their exact interface shapes:
     - `profession-normalizer`
     - `profession-outlook`
     - `worker-api` wiring composer
2. Introduce an assembler entrypoint
   - Add `makeWorkerFetch(env)` (name is flexible) that:
     - validates required bindings exist (KV/D1/secrets/vars)
     - creates adapters for each module-owned protocol
     - constructs module instances with config (prompt version)
     - plugs them into `createWorkerFetchHandler(...)` (wiring composer)
3. Add the router glue
   - Update the Worker `fetch` in `oracle/apps/am-i-done-api/src/index.js` to:
     - respond to `GET /health`
     - delegate `POST /api/outlook` to the assembled handler
     - return 404 for unknown paths
4. Add assembler tests
   - Use spies for KV/D1 and OpenRouter HTTP client.
   - Assert:
     - missing bindings fail fast with clear errors
     - adapters are constructed with correct config (model ids, timeouts, base URL, prompt version)
     - `/api/outlook` delegation reaches wiring composer with correct dependency shapes
5. Run tests and deploy
   - `./scripts/run_silent.sh "tests" npm test`
   - `npm run worker:deploy`
   - Smoke check:
     - `GET /health` returns 200 `ok`
     - `POST /api/outlook` returns structured JSON (no 501)

## Guardrails
- No cache key logic in assembler/router (module-owned).
- No request validation logic in assembler/router beyond binding presence (request guard is a component).
- No shared contract package; keep mapping at the Worker boundary.

## Done criteria
- Worker `/api/outlook` path is live and uses real module instances via assembler + wiring composer.
- Tests cover assembler binding/config wiring and router delegation.
- Deployment succeeds and smoke checks pass.

