---
date: 2026-02-21
model: gpt-5.2
description: "Spec: LLM adapter implementing profession-normalizer model client interface"
---

# Spec: LLM Normalizer Model Client Adapter (v1)

## Goal
Implement the `profession-normalizer` module-owned `NormalizerModelClient.normalize(...)` protocol by calling the configured LLM endpoint.

This adapter is produced by the Worker assembler.

## Target interface shape
- `normalizerModelClient.normalize(input) -> Promise<NormalizerResult>`

Input:
- `profession: string` (already deterministically normalized by the module)
- `locale: string`

Output:
- `NormalizerResult` as defined by the `profession-normalizer` module.

## Configuration (assembler-provided)
Required:
- `LLM_API_KEY` secret
- `model` identifier (string)
- timeout (ms)

Optional:
- endpoint URL override (defaults to Nomos)

## Prompt contract (v1)
The adapter must:
- Request a strict JSON-only response.
- Use a system prompt that:
  - describes the allowed output schema
  - forbids extra keys and non-JSON text
  - instructs to return `needsClarification=true` when input is not a profession or is too vague
- Use a user prompt that includes:
  - `profession`
  - `locale`

## Response parsing & validation
- Parse model output as JSON.
- Validate minimal schema:
  - If `needsClarification=true`: must include `clarification.message` (string) and `clarification.suggestions` (array).
  - If `needsClarification=false`: must include `canonicalProfession` (string).
- On invalid JSON or schema: throw an error (do not guess).

## Tests (required)
Using an HTTP client spy:
- Sends request with expected headers (auth) and payload fields (model, messages).
- Passes through `profession` and `locale` in the prompt.
- Parses valid JSON output and returns the normalized result.
- Throws on non-JSON output.
- Throws on JSON output missing required keys.

## Done criteria
- Adapter implements the protocol and is covered by tests.
