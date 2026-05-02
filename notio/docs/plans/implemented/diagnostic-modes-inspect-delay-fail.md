---
title: "Diagnostic Modes: inspect, delay, fail"
date: 2026-04-19
model: claude-opus-4-6
description: "Implement remaining diagnostic modes per ADR-004 and the webhook adapter spec"
status: complete
type: note
---

# Diagnostic Modes: inspect, delay, fail

## Why now

ADR-004 mandates config-driven diagnostic composition on the real ingress surface. The `ack` mode already exists. Adding `inspect`, `delay`, and `fail` completes the diagnostic toolkit before the capture pipeline adds complexity. These modes are essential for:

- **inspect**: see what Telegram is actually sending (update structure, entity types) without needing to deploy parsing code
- **delay**: test Telegram's retry behavior and Cloudflare Tunnel timeout thresholds
- **fail**: test Telegram's retry/backoff and verify alerting when the service returns 5xx

## Current state

- `DiagnosticMode` enum exists with only `.ack`
- `Config` reads `NOTIO_DIAGNOSTIC_MODE` from env
- Webhook route uses `config.diagnosticMode` but only handles `ack`
- Spec: `docs/specs/telegram-webhook-adapter-behavior-v0.0.2.md` defines all four modes

## Plan

### Step 1 — `inspect` mode

- Add `.inspect` case to `DiagnosticMode`
- In the webhook handler, when mode is `.inspect`:
  - Decode the raw request body as JSON (not typed — raw `[String: Any]`)
  - Log a sanitized, bounded subset: `update_id`, `message.chat.id`, `message.text` (truncated), `message.entities` summary
  - Return 200 immediately
  - No downstream processing
- Tests: verify inspect logs bounded payload, does not reflect payload in response, does not trigger downstream

### Step 2 — `delay` mode

- Add `.delay` case to `DiagnosticMode`
- Add `NOTIO_DIAGNOSTIC_DELAY_MS` env var (default: 5000)
- In the webhook handler, when mode is `.delay`:
  - Sleep for the configured delay
  - Log with `latency_ms` field
  - Return 200
- Tests: verify delay waits configured time, logs latency, returns success

### Step 3 — `fail` mode

- Add `.fail` case to `DiagnosticMode`
- Add `NOTIO_DIAGNOSTIC_FAIL_STATUS` env var (default: 500)
- In the webhook handler, when mode is `.fail`:
  - Log the failure with configured status
  - Return the configured HTTP status
  - No downstream processing
- Tests: verify fail returns configured status, logs failure, does not trigger downstream

### Step 4 — Normal mode: forward to downstream (stub)

- When `diagnosticMode` is `nil` (normal operation):
  - Ack immediately (existing behavior)
  - Add a placeholder/protocol for downstream capture processing (not implemented yet — just the boundary)
  - This prepares the wiring for capture pipeline step 1

## Spec traceability

| Spec test | Step |
|-----------|------|
| Test 3: ack mode | Already implemented |
| Test 4: inspect mode | Step 1 |
| Test 5: delay mode | Step 2 |
| Test 6: fail mode | Step 3 |
| Test 7: diagnostic modes require explicit config | Already implemented (nil default) |

## Release

Each step is a code change → version bump → tag → deploy → verify on VPS with the real ingress path.
