---
title: ADR-006 Two-Phase Capture Feedback
date: 2026-04-19
model: gpt-5.4
description: "Locks the decision that Telegram capture requests receive immediate receipt feedback and a final outcome message."
version: 0.0.1
status: accepted
type: adr
---

# ADR-006: Two-Phase Capture Feedback

## Status
Accepted

## Executive Summary

User-facing capture feedback is part of the v1 capture contract.
For each normal Telegram capture request accepted into processing, the system attempts two Telegram feedback deliveries: an immediate receipt acknowledgement and a final outcome message indicating success or failure.
ADR-001 boundaries remain intact: the capture service stays unaware of Telegram transport metadata and feedback delivery mechanics.
This ADR defines the behavior and boundary rules, not the internal wiring pattern.

## Context

ADR-001 established four parts: ingress adapter, capture service, storage interface, and storage implementation. The capture service owns parsing, normalization, enrichment orchestration, and persistence through a write-only store. The ingress adapter owns request receipt at the Telegram boundary.

Users currently receive no user-visible feedback after sending a message to the bot. They do not know whether the bot received the message, whether capture started, or whether persistence succeeded.

The required product behavior has two distinct moments:

1. **Receipt feedback** — acknowledge that the message was received and accepted into the normal capture flow.
2. **Outcome feedback** — report the result of processing after the capture attempt finishes.

Those moments must be defined separately from the internal implementation pattern. The architectural requirement is to preserve ADR-001's capture-service boundary while still making feedback visible to the user.

## Decision

The system adopts two-phase user-visible capture feedback for normal Telegram capture requests.

1. **Receipt feedback is required.** When a normal Telegram message is accepted into the capture flow, the system immediately attempts receipt feedback.
2. **Outcome feedback is required.** After capture processing finishes, the system attempts exactly one final outcome feedback delivery indicating success or failure.
3. **The capture service is not modified for Telegram feedback.** It does not accept `chatId`, does not know about Telegram delivery, and does not own the feedback lifecycle.
4. **Telegram transport metadata remains at the boundary.** `chatId` stays in the ingress/composition layer and must not become part of the capture-service contract or canonical item.
5. **Telegram feedback capability is mandatory for Telegram ingress.** When the Telegram bot token required for feedback delivery is absent, the server must not start in normal Telegram capture mode.
6. **This ADR does not mandate a specific internal pattern** for outcome feedback. Decorator-based composition is allowed, but orchestration details are left to the spec and implementation as long as ADR-001 boundaries are preserved.

## Rules / Invariants

- Every normal Telegram capture request accepted into processing MUST attempt immediate receipt feedback.
- Every normal Telegram capture request accepted into processing MUST attempt exactly one final outcome feedback delivery.
- The capture service MUST NOT accept `chatId` or any Telegram transport metadata as a parameter.
- The capture service MUST NOT orchestrate or trigger Telegram feedback directly.
- Telegram transport metadata MUST remain outside the canonical captured item.
- Feedback delivery failure MUST NOT alter the capture persistence outcome.
- When Telegram feedback configuration is incomplete, the server MUST fail startup rather than run normal Telegram capture without feedback.
- The internal wiring for feedback MUST preserve ADR-001's capture-service boundary.

## Consequences

### Positive
- users get immediate confirmation that the bot received their message
- users get a separate final result after processing finishes
- capture service boundary from ADR-001 is preserved — no Telegram metadata and no feedback orchestration inside the service
- implementation retains flexibility to choose a boundary-preserving composition pattern

### Negative
- the system now owns two distinct feedback moments instead of one silent flow
- implementation must coordinate receipt and outcome feedback without leaking Telegram concerns into the capture service

## Non-Goals

- Message copy and formatting details (spec concern, not architecture).
- Retry or delivery guarantee for feedback messages.
- Mandating a specific internal implementation pattern for outcome feedback.
- Feedback behavior for non-Telegram ingress adapters (only one ingress exists in v1).
- Read-back or query flows triggered by feedback.
