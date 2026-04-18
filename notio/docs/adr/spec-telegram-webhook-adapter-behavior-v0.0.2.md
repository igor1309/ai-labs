---
title: Telegram Webhook Adapter Behavior
date: 2026-04-18
version: 0.0.2
author: OpenAI GPT-5.4 Thinking
status: draft
type: spec
---

# Telegram Webhook Adapter Behavior

## Purpose

Define the runtime behavior of the Telegram webhook adapter used in front of the capture service.

This document covers:

- webhook acknowledgment behavior
- diagnostic modes for infrastructure validation
- minimal observability requirements
- boundaries between webhook adapter and capture-domain processing

It does not define:

- capture parsing rules
- canonical item schema
- storage behavior
- enrichment behavior

## Role of the adapter

The Telegram webhook adapter is an ingress component.

Its responsibilities are limited to:

- receive Telegram webhook requests
- validate and parse the inbound HTTP request at transport level
- acknowledge receipt quickly
- emit minimal structured logs for observability
- optionally operate in explicit diagnostic modes for infrastructure testing
- forward work to downstream processing when enabled

It is not responsible for:

- canonical capture normalization
- enrichment
- storage semantics
- GitHub or Supabase specifics

## Core behavioral rule

Successful webhook acknowledgment is independent of capture-domain processing.

That means:

- the adapter must not wait for parsing, enrichment, or storage to complete before replying to Telegram
- the adapter may acknowledge successfully even when downstream capture processing is stubbed, disabled, or intentionally absent in an infrastructure-validation slice
- adapter success means the webhook request was accepted by the ingress layer, not that the capture item was successfully processed or persisted

## Acknowledgment semantics

For normal accepted requests, the adapter should:

- return a successful HTTP response quickly
- avoid blocking on downstream business logic
- keep response semantics stable and simple

The response body is not important. Fast successful HTTP acknowledgment is the important contract.

A body such as `ok` is sufficient.

## Diagnostic modes

The adapter may support explicit diagnostic modes for setup, testing, and future debugging.

These modes are adapter diagnostics, not normal business behavior.

They must be gated by configuration and should not be enabled accidentally.

### `ack`

Purpose:

- prove the webhook path works end to end

Behavior:

- accept request
- log minimal request facts
- return successful HTTP response immediately
- perform no downstream capture work

### `inspect`

Purpose:

- inspect real Telegram payload delivery without engaging capture logic

Behavior:

- accept request
- log structured request facts useful for debugging
- optionally log a sanitized subset of payload fields
- return successful HTTP response immediately
- perform no downstream capture work

`inspect` does not mean reflecting the inbound payload back in the HTTP response.

### `delay`

Purpose:

- test timeout behavior and observe Telegram / Cloudflare / tunnel handling of slow responses

Behavior:

- intentionally wait for a configured delay
- then return a response according to configuration, typically success
- emit latency-focused logging

This mode is for controlled diagnostics only.

### `fail`

Purpose:

- verify observability of application-side webhook failure
- distinguish infrastructure reachability from application failure behavior

Behavior:

- intentionally return configured failure status, typically `5xx`
- emit explicit failure logs
- perform no downstream capture work

This mode is for controlled diagnostics only.

## Recommended first slice

The first runtime slice should be enough to validate:

- Telegram can reach the public webhook endpoint
- Cloudflare routes requests correctly
- tunnel forwards requests to the VPS application
- application receives requests
- application can respond fast enough for webhook health

A minimal first slice may therefore support:

- `ack`
- `inspect`
- `delay`
- `fail`

before any real capture processing is connected.

## Logging

Logging should be minimal, structured, and useful for infrastructure validation.

Recommended fields:

- timestamp
- mode
- request path
- response status
- latency
- Telegram `update_id` if available
- chat identifier if available and safe to record

Avoid full payload dumping by default.

If payload inspection is needed, prefer sanitized, bounded logging behind explicit diagnostic mode.

## Failure model

At this stage, failures are primarily transport- and adapter-level:

- request not received
- request routed incorrectly
- tunnel unavailable
- application unavailable
- application intentionally delayed
- application intentionally failed

Capture-domain failures are out of scope for webhook acknowledgment behavior.

## Configuration expectations

Diagnostic behavior should be controlled explicitly, for example by:

- environment variable
- runtime configuration
- separate diagnostic route or endpoint mapping

The mechanism is an implementation detail, but accidental activation in normal production flow should be avoided.

## Non-goals

This adapter spec does not define:

- Telegram command handling
- message parsing rules beyond transport acceptance
- capture-item creation
- retry semantics for storage or enrichment
- downstream queueing model

## Summary

The webhook adapter exists to acknowledge Telegram updates quickly and reliably at the ingress boundary.

Its first useful form is an infrastructure-validation adapter with explicit diagnostic modes:

- `ack`
- `inspect`
- `delay`
- `fail`

The key rule is that webhook acknowledgment is independent from capture-domain processing.
