---
date: 2026-02-21
model: gpt-5
description: "Spec: raw-input counters store (D1-backed) for request-level profession key tracking"
---

# Spec: Raw Input Counters Store (v1)

## Goal
Increment per-request normalized raw-profession counters for analytics and synonym discovery.

This is a `worker-api`-owned dependency used by `popularityTracker`.

## Public interface
- `rawInputCountersStore.increment(rawProfessionKey) -> Promise<void>`

### Input
- `rawProfessionKey: string` (non-empty)

## Storage model (D1)
Use table `raw_input_counters`:
- `raw_profession_key` (PK)
- `count` (INTEGER)
- `updated_at` (TEXT, ISO timestamp)

## Behavior
`increment(rawProfessionKey)` performs an atomic upsert:
- If row does not exist: create with `count=1`, set `updated_at=now`.
- If row exists: increment `count` by 1, set `updated_at=now`.

Validation:
- If `rawProfessionKey` is empty after trimming, throw an error.

## Tests (required)
Adapter tests using a D1 spy:
- Uses an upsert statement (insert + on-conflict update).
- Binds `rawProfessionKey` and `updated_at` values as parameters.
- Throws on empty `rawProfessionKey`.

## Done criteria
- Interface is defined and used by `popularityTracker`.
- D1 adapter is specified and covered by adapter tests.
