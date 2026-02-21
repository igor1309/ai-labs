---
date: 2026-02-21
model: gpt-5.2
description: "Spec: popularity counters store (D1-backed) for canonical profession rollups"
---

# Spec: Popularity Counters Store (v1)

## Goal
Increment per-profession counters for analytics (popularity index / heat map).

This is a `worker-api`-owned dependency used by wiring composers. The D1 adapter is produced by the Worker assembler.

## Public interface
- `popularityCountersStore.increment(canonicalProfession) -> Promise<void>`

### Input
- `canonicalProfession: string` (non-empty)

## Storage model (D1)
Use table `profession_counters` (see `oracle/apps/am-i-done-api/migrations/0001_init.sql`):
- `canonical_profession` (PK)
- `count` (INTEGER)
- `updated_at` (TEXT, ISO timestamp)

## Behavior
`increment(canonicalProfession)` performs an atomic upsert:
- If row does not exist: create with `count=1`, set `updated_at=now`.
- If row exists: increment `count` by 1, set `updated_at=now`.

Validation:
- If `canonicalProfession` is empty after trimming, throw an error.

## Tests (required)
Adapter tests using a D1 spy:
- Uses an upsert statement (insert + on-conflict update).
- Binds `canonicalProfession` and `updated_at` values as parameters.
- Throws on empty `canonicalProfession`.

## Done criteria
- Interface is defined and used by composition wiring.
- D1 adapter is specified and covered by adapter tests.

