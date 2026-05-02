---
title: "Next Slice: Capture Pipeline"
date: 2026-04-19
model: claude-opus-4-6
description: "Ordered next steps to build the capture pipeline from webhook adapter through canonical item to storage"
status: draft
type: note
---

# Next Slice: Capture Pipeline

## Context

The initial bring-up (12 steps) is complete. The full ingress path is live:

`Telegram → Cloudflare → Tunnel → VPS → Hummingbird service`

The webhook handler currently acks and logs. The next work builds the actual capture pipeline on top of this foundation.

## Relevant artifacts

- ADR-001: Capture System Boundaries (ingress adapter → capture service → storage interface → storage impl)
- ADR-003: Supabase-Backed Storage Implementation
- ADR-004: Runtime Diagnostics via Config-Driven Composition
- Spec: Telegram Webhook Adapter Behavior v0.0.2 (diagnostic modes, Telegram Update parsing)
- Spec: Capture Message and Canonical Item Schema v0.0.1 (ingress normalization, canonical item shape)

## Ordered steps

### 1. Telegram webhook adapter — parse Update JSON

Implement the adapter spec: decode `telegram_update` body into a typed `TelegramUpdate`, extract `update_id`, `chat_id`, `text`, and `entities`. Forward a normalized message shape downstream (or stub the downstream boundary). Log `update_id` and `chat_id` in the structured webhook ack log.

**Spec:** `docs/specs/telegram-webhook-adapter-behavior-v0.0.2.md`

### 2. Capture message parsing — ingress normalization

Implement the capture message spec: take the normalized message, extract `primary_url` and `note` per the parsing rules (first URL → primary, remaining text → note). Produce an `IngressResult`.

**Spec:** `docs/specs/capture-message-and-item-schema.md` (parsing rules section)

### 3. Canonical item production

Map `IngressResult` → `CapturedItem` with `kind`, `source_type`, `captured_at`, `url`, `note`. Enrichment is stubbed (`enrichment: none`) for this step.

**Spec:** `docs/specs/capture-message-and-item-schema.md` (canonical item section)

### 4. Storage interface + Supabase adapter

Define the write-only `CaptureStore` protocol (submit item → success/failure). Implement the Supabase-backed adapter per ADR-003.

**Spec:** ADR-003, capture message spec (storage boundary section)

### 5. Wire end-to-end and release

Connect webhook adapter → capture parser → canonical item → storage. Release, deploy, verify a captured message appears in Supabase.
