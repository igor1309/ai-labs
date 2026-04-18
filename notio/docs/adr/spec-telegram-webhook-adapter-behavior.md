---
title: Telegram Webhook Adapter Behavior
date: 2026-04-18
version: 0.0.1
status: draft
model: GPT-5.4 Thinking
category: spec
---

# Telegram Webhook Adapter Behavior

## Purpose
This note defines the behavior of the Telegram webhook adapter used for initial setup, infrastructure validation, and future debugging.

This is an adapter/runtime behavior spec.
It is not a capture-domain spec and does not define canonical item shape, enrichment, or storage representation.

## Scope
The adapter sits between Telegram webhook delivery and the capture service.

Its immediate responsibilities are:
- receive webhook requests
- validate that the request reached the service
- acknowledge quickly
- optionally expose controlled diagnostic behavior
- log enough for debugging without leaking unnecessary data

## Core behavior
The adapter must be able to acknowledge receipt of a Telegram update immediately, without waiting for capture processing, enrichment, or storage.

The primary success behavior is:
- accept webhook request
- log minimal request facts
- return success quickly

The intent is to validate the full ingress chain:
- Telegram
- Cloudflare edge
- Cloudflare Tunnel
- VPS
- application route/handler

## Diagnostic modes
The adapter should support explicit runtime modes for setup and debugging.

### 1. `ok`
Behavior:
- return successful response immediately
- do not simulate failure or slowness

Use:
- initial webhook validation
- proving end-to-end ingress connectivity
- baseline health checks

### 2. `echo`
Behavior:
- return successful response immediately
- log essential request details for inspection
- may include a small success payload/body if useful for local debugging

Use:
- inspect real Telegram payload shape
- validate route wiring and handler invocation
- support early parsing work

### 3. `delay`
Behavior:
- intentionally wait for a configured interval before responding
- then return a response

Use:
- observe timeout behavior
- validate retry/visibility behavior across Telegram, Cloudflare, Tunnel, and service logs
- expose infra problems independently of capture logic

### 4. `fail`
Behavior:
- intentionally return a server failure response

Use:
- validate observability and alerting
- distinguish transport reachability from application-level failure
- support controlled infra diagnostics in production-like conditions

## Operational guidance
Diagnostic behavior must be explicit and controlled.

It must not be easy to accidentally leave the adapter in a failing or delayed mode.

Recommended controls:
- environment flag
- explicit runtime configuration
- separate diagnostic route or guarded mode if needed

The adapter should not silently switch behavior based on ad hoc request content.

## Logging
The adapter should log enough to validate ingress and diagnose failures.

Useful fields include:
- request receipt timestamp
- route/path hit
- selected adapter mode
- request method
- response status
- response latency
- Telegram update identifier if present

Logging should avoid unnecessary full-payload dumping by default.
If payload inspection is needed, that should be a conscious debug choice.

## Non-goals
The adapter does not own:
- canonical message parsing rules
- enrichment
- storage persistence
- markdown rendering
- GitHub or Supabase semantics

Those remain outside the webhook adapter boundary.

## Consequences
This behavior provides a small but valuable first vertical slice:
- end-to-end ingress can be validated before domain logic exists
- infra failures can be reproduced deliberately
- production debugging becomes easier
- the adapter remains thin and separable from capture logic

## Recommended first slice
The first deployed version should support at least:
- immediate success acknowledgment
- minimal request logging
- explicit `delay` mode
- explicit `fail` mode

That is sufficient to validate wiring of:
- Telegram webhook
- `inbox.enoa.ai`
- Cloudflare
- Cloudflare Tunnel
- VPS-hosted service
