---
date: 2026-02-21
model: gpt-5.2
description: "Implementation plan: wire real /api/outlook path in the deployed Worker"
---

# Wire real `/api/outlook` in Worker

## Goal
Replace the current stubbed 501 `/api/outlook` implementation with:
- router delegation to the wiring composer handler,
- assembled module instances and adapters created from `env`.

## Deliverables
- Worker entrypoint updated:
  - `oracle/apps/am-i-done-api/src/index.js` delegates `/api/outlook` to the assembled handler.
- Assembler implementation added/updated in Worker app sources.

## Steps
1. Replace stub with router delegation
   - Keep `GET /health` unchanged.
   - For `POST /api/outlook`, call the assembled handler and return its `Response`.
2. Implement assembler responsibilities
   - Validate required bindings exist at startup/assembly time.
   - Create adapters:
     - KV JSON cache adapter for normalizer cache and outlook cache
     - D1 popularity counters adapter
     - OpenRouter normalizer model client adapter
     - OpenRouter outlook model client adapter
   - Instantiate module services using module-owned protocols and config:
     - normalizer service
     - outlook service (with `promptVersion`)
   - Plug into `worker-api` wiring composer (`createWorkerFetchHandler`).
3. Ensure Worker runtime safety
   - No Node-only APIs in `oracle/apps/am-i-done-api/src/*`.
4. Close out
   - Run `./scripts/run_silent.sh "tests" npm test`.
   - Commit the change set (do not push unless explicitly requested).

## Done criteria
- `/api/outlook` returns the wiring composer JSON response shape (not 501).
- No runtime-only dependency leaks (Worker-compatible).
- Tests pass.
