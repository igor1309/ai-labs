---
date: 2026-02-21
model: gpt-5.2
description: "Spec: profession-normalizer module (interfaces, behavior, cache keying, and tests)"
---

# Spec: Profession Normalizer (v1)

## Goal
Given a user-provided profession string and locale, produce either:
- a canonical profession label (plus optional category hints), or
- a clarification request (`needsClarification=true`) with a message and suggestions.

This module owns the normalization behavior and all protocols it depends on.

## Public interface
The module exposes a service with this shape:

- `professionNormalizer.normalize(input) -> Promise<NormalizerResult>`

### `input`
- `profession: string`
- `locale: string`

### `NormalizerResult`
Either:

1) Needs clarification
- `needsClarification: true`
- `clarification: { message: string, suggestions: string[] }`

2) Canonical
- `needsClarification: false`
- `canonicalProfession: string`
- `category?: string`
- `categoryConfidence?: number`

## Owned protocols (module-owned interfaces)
All protocols live in this module (client-owned protocol rule).

### `NormalizerCache`
- `read(key: string) -> Promise<NormalizerResult | null | undefined>`
- `write(key: string, value: NormalizerResult) -> Promise<void>`

Notes:
- `null` and `undefined` both mean “miss”.
- Cache stores both canonical and clarification results.

### `NormalizerModelClient`
- `normalize(input) -> Promise<ModelNormalizerResult>`

`input`:
- `profession: string` (already deterministically normalized)
- `locale: string`

`ModelNormalizerResult`:
- Same shape as `NormalizerResult`, plus any optional fields the policy might use (if needed later).

## Deterministic input normalization
Before caching/model call, normalize `profession` deterministically:
- `trim`
- collapse internal whitespace to single spaces

No case-folding in v1 (keep input casing); if we change this later, it is a breaking cache-key change.

## Clarification policy (balanced)
The module returns a canonical profession only when the result is sufficiently specific.

Policy v1:
- If the model returns `needsClarification=true`, return it as-is.
- If the model returns `needsClarification=false`, return it as-is.

Follow-up refinement (optional, later):
- If the model returns canonical output with low confidence or generic titles, convert to `needsClarification=true`.

## Caching behavior
### Cache key
`normalizer:${locale}:${normalizedProfession}`

### Hit/miss behavior
1. Read cache.
2. On hit: return cached `NormalizerResult`.
3. On miss: call `NormalizerModelClient.normalize(...)`.
4. Write returned result to cache.
5. Return result.

## Errors
This module does not deal with transport/HTTP errors directly.

If its cache/model client throws, the error is propagated to the caller (composition decides how to map failures to HTTP).

## Tests (required)
### Service tests
Using spies:
- On cache hit: does not call model client; returns cached result.
- On cache miss: calls model client with normalized profession; writes cache; returns model result.
- Cache key uses locale + normalized profession.
- `null` and `undefined` cache reads are both treated as miss.

### Pure helper tests
- Deterministic normalization (trim + collapse whitespace).

## Done criteria
- Exports `professionNormalizer.normalize(...)` service.
- Owns protocols (`NormalizerCache`, `NormalizerModelClient`) in the same module.
- Has tests covering cache hit/miss, keying, normalization helper, and nullish miss behavior.
