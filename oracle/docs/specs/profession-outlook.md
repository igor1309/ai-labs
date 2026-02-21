---
date: 2026-02-21
model: gpt-5.2
description: "Spec: profession-outlook module (interfaces, behavior, cache keying, and tests)"
---

# Spec: Profession Outlook (v1)

## Goal
Given a canonical profession, locale, schema version, prompt version, and optional hints, generate a fixed structured multi-part outlook answer.

This module owns the outlook behavior and all protocols it depends on.

## Public interface
The module exposes a service with this shape:

- `professionOutlookService.getOutlook(input) -> Promise<OutlookAnswer>`

### `input`
- `canonicalProfession: string`
- `locale: string`
- `schemaVersion: string`
- `hints?: { category?: string, categoryConfidence?: number }`

Configuration input (provided at assembly time):
- `promptVersion: string`

### `OutlookAnswer`
```ts
{
  headline: string,
  timeHorizon: { label: string, explanation: string },
  confidence: { label: "low" | "medium" | "high", rationale: string },
  keyRisks: string[],
  whatToDoNext: string[],
  assumptions: string[]
}
```

## Owned protocols (module-owned interfaces)
All protocols live in this module (client-owned protocol rule).

### `OutlookCache`
- `read(key: string) -> Promise<OutlookAnswer | null | undefined>`
- `write(key: string, value: OutlookAnswer) -> Promise<void>`

Notes:
- `null` and `undefined` both mean “miss”.

### `OutlookModelClient`
- `generate(input) -> Promise<OutlookAnswer>`

`input`:
- `canonicalProfession: string`
- `locale: string`
- `schemaVersion: string`
- `promptVersion: string`
- `hints?: { category?: string, categoryConfidence?: number }`

## Caching behavior
### Cache key
`outlook:${canonicalProfession}:${locale}:${schemaVersion}:${promptVersion}`

### Hit/miss behavior
1. Read cache.
2. On hit: return cached `OutlookAnswer`.
3. On miss: call `OutlookModelClient.generate(...)`.
4. Write returned answer to cache.
5. Return answer.

## Errors
This module does not deal with transport/HTTP errors directly.

If its cache/model client throws, the error is propagated to the caller (composition decides how to map failures to HTTP).

## Tests (required)
### Service tests
Using spies:
- On cache hit: does not call model client; returns cached answer.
- On cache miss: calls model client with expected payload (including `promptVersion` and `hints`); writes cache; returns model answer.
- Cache key includes canonical profession + locale + schemaVersion + promptVersion.
- `null` and `undefined` cache reads are both treated as miss.

## Done criteria
- Exports `professionOutlookService.getOutlook(...)` service.
- Owns protocols (`OutlookCache`, `OutlookModelClient`) in the same module.
- Has tests covering cache hit/miss, keying, payload (including optional hints), and nullish miss behavior.
