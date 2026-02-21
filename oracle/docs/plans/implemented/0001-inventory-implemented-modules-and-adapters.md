---
date: 2026-02-21
model: gpt-5.2
description: "Implementation plan: inventory implemented modules/adapters for Worker assembly"
---

# Inventory implemented modules/adapters

## Goal
Create a single inventory document that lists every implemented module/adapter/decorator (including `PopularityTracker`), its public API, owned protocols, wiring points, tests, and Cloudflare bindings it needs. The inventory should be sufficient for another agent to assemble the Worker without reading the whole repo.

## Deliverable
- `oracle/docs/inventory/implemented-components.md`

## Steps
1. Discover what exists (repo snapshot)
   - Run a file inventory over `oracle/` to locate packages, entrypoints, adapters, and tests.
   - Grep for component keywords (`Normalizer`, `Outlook`, `requestGuard`, `PopularityTracker`, `Counters`, `KV`, `D1`, `OpenRouter`, `assembler`, `router`).
2. Identify each component and its contract
   - For each module/adapter/decorator/assembler/router:
     - Public interface shape (function names + input/output)
     - Required dependencies (protocol shapes)
     - Config inputs (promptVersion, model ids, timeouts)
     - Cloudflare bindings used (KV/D1/secrets/vars)
   - Cross-check against specs in `oracle/docs/specs/implemented/`.
3. Inventory test coverage and execution
   - For each component:
     - Test file(s) that cover it and what they assert (wiring, adapters, parsing, persistence).
   - Confirm how to run tests (`./scripts/run_silent.sh "tests" npm test`).
4. Write the inventory doc
   - Create `oracle/docs/inventory/implemented-components.md` with:
     - Components list (grouped by module/adapter/decorator/assembler/router)
     - Cloudflare bindings map (binding → component)
     - Spec drift notes (spec vs implementation deltas, if any)
     - “Ready to assemble” checklist (including implemented tracker behavior and any remaining deployment-only gaps)
5. Close out
   - Run `./scripts/run_silent.sh "tests" npm test`.
   - Update `oracle/docs/log.md` (newest bullet first under the current date).
   - Commit the inventory change set (do not push unless explicitly requested).

## Done criteria
- Inventory doc exists and is accurate enough to assemble without repo archaeology.
- `PopularityTracker` is documented as implemented, wired, and test-covered.
- Drift (if any) is explicitly listed.
- Tests pass.
