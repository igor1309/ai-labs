---
title: Spec — Example
date: 2026-04-12
author: Igor Malyarov
version: 0.0.1
format: example
source: condensed from oracle/docs/specs/implemented/cloudflare-kv-json-cache-adapter.md
---

# Spec — Example

The example below is condensed from a real spec.

---

```markdown
---
date: 2026-02-21
model: gpt-5.2
description: "Spec: Cloudflare KV JSON cache adapter for module-owned cache interfaces"
---

# Spec: Cloudflare KV JSON Cache Adapter (v1)

## Goal

Provide a Worker-side adapter that implements module-owned cache
interfaces (`read`/`write`) using Cloudflare KV. Created by the Worker
assembler; must not leak Cloudflare types outside assembly.

## Public interface

The adapter implements:

- `read(key: string) -> Promise<T | null | undefined>`
- `write(key: string, value: T) -> Promise<void>`

Where `T` is JSON-serializable.

## Behavior rules

### Read

1. Call `kv.get(key)`.
2. If result is `null` — return `null` (miss).
3. If result is a string — parse as JSON.
4. If JSON parse fails — treat as miss (`null`).

### Write

1. Serialize with `JSON.stringify(value)`.
2. Call `kv.put(key, serialized)`.

### Constraints

- No TTL in v1.
- Adapter does not attempt to "repair" corrupted values; treats them
  as miss.

## Tests (required)

Using KV spies:

1. Read returns `null` on KV miss (`get` returns `null`).
2. Read returns parsed value on JSON hit.
3. Read returns `null` on invalid JSON string.
4. Write calls `put` with JSON string for the value.

## Done criteria

- Adapter matches the target interface and passes all listed tests.
- No Cloudflare types leak outside the adapter module.
```
