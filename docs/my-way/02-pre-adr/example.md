---
title: Pre-ADR — Example
date: 2026-04-12
author: Igor Malyarov
version: 0.0.1
format: example
source: imaginary — no pre-ADR examples exist in this repository yet
---

# Pre-ADR — Example

The example below is imaginary, constructed to illustrate the structure.

---

```markdown
---
date: 2026-03-10
model: gpt-5.2
description: "Pre-ADR: cache layer ownership for profession normalizer"
---

# Cache Layer Ownership for Profession Normalizer

## Context

The profession normalizer needs caching to avoid redundant model calls.
Research surfaced three viable approaches. The key tension is: who owns
the cache protocol — the normalizer module, a shared cache package, or
the composition layer?

Constraints from prior decisions:
- Protocol-owned-by-client rule (CLAUDE.md): protocols live with their client.
- No shared utility packages unless explicitly requested.

## Options considered

### Option A — Normalizer owns its cache protocol

- **Description**: `NormalizerCache` protocol lives inside the normalizer
  module. Composition layer provides a KV-backed implementation.
- **Tradeoffs**: clean ownership, no shared package needed. Each module
  that needs caching defines its own protocol — possible duplication of
  similar shapes.
- **Risks**: if many modules need caching, the duplication may become
  friction. Acceptable at current scale.

### Option B — Shared cache package

- **Description**: a `cache` package exports a generic `Cache<T>` protocol.
  All modules import it.
- **Tradeoffs**: eliminates protocol duplication. Introduces a shared
  dependency — violates the "no shared utility packages" constraint.
- **Risks**: coupling through a shared abstraction. Changes to the cache
  interface ripple across all consumers.

### Option C — Composition layer owns the protocol

- **Description**: the Worker assembler defines the cache shape and passes
  it to the normalizer.
- **Tradeoffs**: centralizes cache concerns. Normalizer becomes unaware of
  caching — but also cannot express cache-specific behavior (e.g., key
  format).
- **Risks**: normalizer loses control of its own cache keying, which is
  domain-specific.

## Emerging direction

Option A. It follows the protocol-owned-by-client rule directly. The
duplication risk is theoretical at current scale (two modules need caching).
If duplication becomes real friction later, a shared package can be
introduced as a deliberate decision, not a premature abstraction.

## Provisional boundaries

- `NormalizerCache` protocol: owned by normalizer module.
- Cache key format (`normalizer:${locale}:${profession}`): owned by
  normalizer module.
- KV adapter implementation: owned by composition layer.
- Cache TTL policy: deferred to a future decision.

## Open questions

- Should cache misses on JSON parse failure be logged or silent?
- Is `null | undefined` as miss sufficient, or should we distinguish
  "not cached" from "cached as empty"?
```
