---
date: 2026-02-26
model: gpt-5.2
source: https://chatgpt.com/share/69a04dee-78a4-8003-8d39-553a25372c4f
---

# Nomos — Testability Requirements (Day 0)

Date: 2026-02-26  
Status: Accepted  
Scope: V0

---

## 1. Configurable Provider Endpoints

Nomos MUST allow overriding LLM provider endpoints for testing.

For each provider configuration:
- `base_url` (string, default vendor URL)
- `timeout_ms`
- optional `headers` (key/value)

Rationale: enables swap to local stub/mock without code changes.

---

## 2. Runner Boundary

Nomos MUST route all outbound provider calls through a single runner abstraction.

Runner responsibilities:
- execute HTTP requests
- surface response metadata
- support streaming responses

Implementations:
- `HttpRunner`: real network calls
- `StubRunner`: scripted deterministic responses for tests

Rationale: test routing, budgets, and guardrails without real vendor dependency.

---

## 3. Streaming Contract

Nomos streaming is SSE to clients and MUST be testable via a deterministic internal stream model.

StubRunner MUST be able to emit a scripted sequence:
- `chunk` events
- `error` events
- `end` event

Tests MUST assert event ordering and termination behavior.