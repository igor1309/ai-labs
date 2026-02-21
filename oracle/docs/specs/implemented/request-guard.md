---
date: 2026-02-21
model: gpt-5.2
description: "Spec: worker-api request guard (validate outlook request body)"
---

# Spec: Request Guard (v1)

## Goal
Validate and shape the raw JSON request body for `POST /api/outlook` into a safe, typed payload for composition wiring.

This is a `worker-api`-owned component.

## Public interface
- `requestGuard.validate(input) -> Promise<GuardResult>`

### `input`
The raw parsed JSON request body (`unknown`).

### `GuardResult`
Either:

1) Invalid
- `isValid: false`
- `schemaVersion: string` (resolved, default `"1"`)
- `clarification: { message: string, suggestions: string[] }`

2) Valid
- `isValid: true`
- `value: { profession: string, locale: string, schemaVersion: string }`

## Validation rules (v1)
Return `isValid=false` when:
- `profession` is missing, non-string, or empty after `trim()`
- `locale` is missing, non-string, or empty after `trim()`

Return `isValid=true` otherwise.

Schema version resolution:
- If `schemaVersion` is a non-empty string → use it.
- Else → `"1"`.

Notes:
- The guard does not normalize the profession string (normalization is module-owned).
- The guard must not throw for any input shape.
- Suggestions are empty in v1 (clarification messaging only).

## Tests (required)
Unit tests for `validate`:
- Returns invalid on non-object inputs (`null`, array, string, number).
- Returns invalid on missing/empty/non-string `profession`.
- Returns invalid on missing/empty/non-string `locale`.
- Returns valid on minimal correct payload (extra fields ignored).
- `schemaVersion` defaults to `"1"` when missing/invalid; uses provided non-empty string otherwise.

## Done criteria
- Exposes `requestGuard.validate`.
- Never throws for any input shape.
- Tests cover all validation rules and schemaVersion resolution.

