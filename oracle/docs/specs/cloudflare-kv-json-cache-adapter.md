---
date: 2026-02-21
model: gpt-5.2
description: "Spec: Cloudflare KV JSON cache adapter for module-owned cache interfaces"
---

# Spec: Cloudflare KV JSON Cache Adapter (v1)

## Goal
Provide a Worker-side adapter that implements module-owned cache interfaces (`read`/`write`) using Cloudflare KV.

This adapter is created by the Worker assembler and must not leak Cloudflare types outside assembly.

## Target interface shape
The adapter must implement:
- `read(key: string) -> Promise<T | null | undefined>`
- `write(key: string, value: T) -> Promise<void>`

Where `T` is JSON-serializable.

## KV behavior
### Read
- Call `kv.get(key)`.
- If result is `null` → return `null` (miss).
- If result is a string:
  - Parse as JSON.
  - If JSON parse fails → treat as miss (`null`).

### Write
- Serialize with `JSON.stringify(value)`.
- Call `kv.put(key, serialized)`.

Notes:
- No TTL in v1.
- Adapter does not attempt to “repair” corrupted values; it treats them as miss.

## Tests (required)
Using KV spies:
- Read returns `null` on KV miss (`get` returns `null`).
- Read returns parsed value on JSON hit.
- Read returns `null` on invalid JSON string.
- Write calls `put` with JSON string for the value.

## Done criteria
- Adapter matches the target interface and passes tests.

