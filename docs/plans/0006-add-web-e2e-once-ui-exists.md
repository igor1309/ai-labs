---
date: 2026-02-21
model: gpt-5.2
description: "Implementation plan: add web E2E tests once the UI exists"
---

# Add web E2E tests (once UI exists)

## Goal
Add end-to-end tests that validate real user flows across web → Worker → OpenRouter (or stubbed model in CI), once the web UI exists.

## Scope
E2E starts only after:
- the web app exists and can run locally in CI,
- the Worker is assembled and callable in a test environment.

## Flows to cover (v1)
- Happy path:
  - input profession → receives structured answer rendered section-by-section.
- Clarification path:
  - ambiguous/non-profession input → receives clarification UI with suggestions.
- Transport failure path:
  - Worker unreachable/timeout → error UI shown.

## Test strategy
- Prefer Playwright.
- In CI, prefer a deterministic model stub (do not spend tokens).
- In a separate manual job, allow real OpenRouter calls if needed.

## Steps
1. Choose runner and setup
   - Add Playwright and configure base URLs for web and Worker.
2. Build a model stub mode for tests
   - Worker assembler switches OpenRouter adapters to stubs under an env flag.
3. Implement the 3 flows
4. Add to CI
5. Run full suite and document
6. Close out
   - Commit the change set (do not push unless explicitly requested).

## Done criteria
- E2E runs reliably in CI with stubs.
- A small optional path exists for real-provider smoke tests without flakiness.
