---
date: 2026-02-21
model: gpt-5.2
description: "Spec: OpenRouter adapter implementing profession-outlook model client interface"
---

# Spec: OpenRouter Outlook Model Client Adapter (v1)

## Goal
Implement the `profession-outlook` module-owned `OutlookModelClient.generate(...)` protocol by calling OpenRouter.

This adapter is produced by the Worker assembler.

## Target interface shape
- `outlookModelClient.generate(input) -> Promise<OutlookAnswer>`

Input:
- `canonicalProfession: string`
- `locale: string`
- `schemaVersion: string`
- `promptVersion: string`
- `hints?: { category?: string, categoryConfidence?: number }`

Output:
- `OutlookAnswer` as defined by the `profession-outlook` module.

## Configuration (assembler-provided)
Required:
- `OPENROUTER_API_KEY` secret
- `model` identifier (string)
- timeout (ms)

## Prompt contract (v1)
The adapter must:
- Request a strict JSON-only response.
- Use a system prompt that:
  - describes the `OutlookAnswer` JSON shape exactly
  - forbids extra keys and non-JSON text
  - enforces stable section names for caching/UI rendering
- Use a user prompt that includes:
  - `canonicalProfession`
  - `locale`
  - `schemaVersion`
  - `promptVersion`
  - optional `hints`

## Response parsing & validation
- Parse model output as JSON.
- Validate minimal schema:
  - `headline` (string)
  - `timeHorizon.label` / `timeHorizon.explanation` (strings)
  - `confidence.label` in `low|medium|high` and `confidence.rationale` (string)
  - `keyRisks`, `whatToDoNext`, `assumptions` arrays of strings
- On invalid JSON or schema: throw an error.

## Tests (required)
Using an HTTP client spy:
- Sends request with expected headers (auth) and payload fields (model, messages).
- Passes through canonical profession, versions, locale, hints in the prompt payload.
- Parses a valid JSON answer and returns it.
- Throws on non-JSON output.
- Throws on missing required keys.

## Done criteria
- Adapter implements the protocol and is covered by tests.

