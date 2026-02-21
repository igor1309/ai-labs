---
date: 2026-02-21
model: gpt-5.2
description: "Implementation plan: write assembler-level tests (spies) for Worker assembly"
---

# Write assembler-level tests (spies)

## Goal
Prove that the Worker assembler correctly:
- validates required Cloudflare bindings,
- constructs adapters with the right config,
- plugs module instances into the wiring composer,
- and that routing delegates to the assembled handler.

These tests validate assembly, not domain behavior.

## Deliverables
- New test suite for assembler/router under the Worker app (location per repo convention for `node:test`).

## Steps
1. Choose the assembler API under test
   - Identify the exported function(s) that build the Worker handler:
     - assembler (e.g. `makeWorkerFetch(env)`)
     - router (e.g. `createRouter({ outlookHandler })` or `makeRouter(fetchOutlook)`).
2. Build spies for bindings and collaborators
   - KV namespace spies:
     - `get(key)` and `put(key, value)` record calls and return configured stub responses.
   - D1 spy:
     - records SQL text and bound parameters (or records the method calls used by the adapter).
   - OpenRouter HTTP/fetch spy:
     - records request URL/headers/body and returns stubbed responses.
   - Random UUID spy (if assembler injects it):
     - returns deterministic request id.
3. Add assembly contract tests
   - Missing binding tests:
     - missing `NORMALIZER_CACHE`, `OUTLOOK_CACHE`, `DB`, `OPENROUTER_API_KEY` should fail fast with clear error messages.
   - Config propagation tests:
     - `PROMPT_VERSION` propagates to the outlook module/service.
     - model ids and timeouts propagate into OpenRouter adapters (defaults vs explicit env).
     - base URL override propagates (when present).
4. Add router delegation tests
   - `/health` returns 200 and `ok`.
   - unknown path returns 404.
   - `/api/outlook` delegates to the assembled outlook handler (spy asserts it was called).
5. Close out
   - Run `./scripts/run_silent.sh "tests" npm test`.
   - Commit the change set (do not push unless explicitly requested).

## Guardrails
- Do not assert on cache keys or module internal behavior here.
- Do not call real network; only spies/stubs.

## Done criteria
- Assembler tests fail when bindings/config wiring is broken.
- Router tests prove correct delegation.
- Tests pass via the repo test command.
