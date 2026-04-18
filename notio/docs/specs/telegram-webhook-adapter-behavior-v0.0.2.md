---
title: Telegram Webhook Adapter Behavior
date: 2026-04-18
model: gpt-5.4
description: "Defines the ingress adapter-owned Telegram webhook contract for acknowledgment, diagnostics, and logging."
version: 0.0.2
status: draft
type: spec
---

# Telegram Webhook Adapter Behavior

## Goal
Define the ingress adapter-owned Telegram webhook contract for accepted-request acknowledgment, diagnostic modes, logging, and boundaries to capture-domain processing.

## Public interface

### Inbound request shape

```yaml
webhook_request:
  method: POST
  platform: telegram
  path: "/<secret-webhook-path>"
  body: telegram_update
```

### Outbound response shape

```yaml
webhook_response:
  status: 2xx | 5xx
  body: optional string
```

### Diagnostic mode configuration

```yaml
diagnostic_mode:
  value: ack | inspect | delay | fail
  enabled_by: explicit runtime configuration
```

## Behavior rules

### Adapter boundary
The Telegram webhook adapter is an ingress component.

It is responsible for:
- receiving Telegram webhook requests
- validating and parsing inbound HTTP requests at transport level
- acknowledging accepted requests quickly
- emitting minimal structured logs for observability
- optionally operating in explicit diagnostic modes for infrastructure testing
- forwarding work to downstream processing when enabled

It is not responsible for:
- canonical capture normalization
- enrichment
- storage semantics
- GitHub or Supabase specifics

### Core acknowledgment rule
Successful webhook acknowledgment is independent of capture-domain processing.

That means:
- the adapter must not wait for parsing, enrichment, or storage to complete before replying to Telegram
- the adapter may acknowledge successfully even when downstream capture processing is stubbed, disabled, or intentionally absent in an infrastructure-validation slice
- adapter success means the webhook request was accepted by the ingress layer, not that the capture item was successfully processed or persisted

### Accepted request semantics
For normal accepted requests, the adapter must:
- return a successful HTTP response quickly
- avoid blocking on downstream business logic
- keep response semantics stable and simple

The response body is not part of the contract. A body such as `ok` is sufficient.

### Diagnostic modes
The adapter may support explicit diagnostic modes for setup, testing, and future debugging.

These modes are adapter diagnostics, not normal business behavior.
They must be gated by explicit configuration and must not be enabled accidentally.

#### `ack`
- accept request
- log minimal request facts
- return successful HTTP response immediately
- perform no downstream capture work

#### `inspect`
- accept request
- log structured request facts useful for debugging
- optionally log a sanitized subset of payload fields
- return successful HTTP response immediately
- perform no downstream capture work

`inspect` does not reflect the inbound payload in the HTTP response.

#### `delay`
- intentionally wait for a configured delay
- return the configured response after the delay, typically success
- emit latency-focused logging

#### `fail`
- intentionally return a configured failure status, typically `5xx`
- emit explicit failure logs
- perform no downstream capture work

### Logging rules
Logging must be minimal, structured, and useful for infrastructure validation.

Recommended fields:
- timestamp
- mode
- request path
- response status
- latency
- Telegram `update_id` if available
- chat identifier if available and safe to record

Full payload dumping is out of scope by default.
Payload inspection, when enabled, must be sanitized and bounded.

### Failure and scope rules
At this stage, failures are transport- and adapter-level:
- request not received
- request routed incorrectly
- tunnel unavailable
- application unavailable
- application intentionally delayed
- application intentionally failed

Capture-domain failures are out of scope for webhook acknowledgment behavior.

### Configuration rules
Diagnostic behavior must be controlled by explicit runtime configuration.
The configuration mechanism is an implementation detail, but it must preserve the same deployed service and ingress surface used for production webhook delivery.

## Tests (required)
1. Accepted requests return a successful HTTP response without waiting for downstream capture processing.
2. Adapter success is preserved when downstream capture processing is stubbed or disabled.
3. `ack` mode returns success immediately and performs no downstream capture work.
4. `inspect` mode returns success immediately, performs no downstream capture work, and logs only sanitized bounded payload details.
5. `delay` mode waits for the configured delay before responding and emits latency-focused logs.
6. `fail` mode returns the configured failure status and performs no downstream capture work.
7. Diagnostic modes require explicit runtime configuration and are not enabled by default.
8. Logging for accepted requests includes the configured structured fields without full payload dumping by default.

## Done criteria
- The webhook adapter implements the inbound/outbound contract and the diagnostic mode configuration in this spec.
- Accepted-request acknowledgment remains independent from capture-domain processing.
- All required test cases in this spec pass.
