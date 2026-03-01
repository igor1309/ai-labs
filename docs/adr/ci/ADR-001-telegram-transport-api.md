---
date: 2026-03-01
model: claude-opus-4-6
description: "Telegram transport script API: variadic chunks, ordered delivery, fail-fast"
---

# ADR-001: Telegram Transport API

## 1. Executive Summary

`notify_telegram.sh` is a shared transport script in `ci-shared` that accepts `<token> <chat_id> <chunk...>`. It owns reliable, ordered delivery via Telegram's `sendMessage` API. Callers own message formatting, splitting, and bot/chat selection. Partial delivery is accepted on failure.

## 2. Context

The Telegram HTTP transport (curl call with correct retry, timeout, and encoding flags) is easy to get subtly wrong. Extracting it into `ci-shared` lets any repo send messages with correct settings.

A single-message API would force callers with long messages to invoke the script multiple times independently. Independent invocations do not guarantee delivery order — especially in CI environments where steps may parallelize or race. Ordered delivery is a transport concern, not a formatting concern.

### Rejected alternatives

- **Single `<message>` param**: Callers with long messages must loop externally, losing ordering guarantees.
- **Auto-splitting at 4096 chars**: That is formatting logic (where to split matters for readability) — belongs with callers.

## 3. Decision

Positional-args API with variadic message chunks. The script sends chunks sequentially in argument order, guaranteeing delivery order within a single invocation. Fail-fast on first error.

## 4. Rules / Invariants

- Script MUST accept 3+ positional args: `<token> <chat_id> <chunk1> [chunk2...]`.
- Script MUST reject fewer than 3 args with usage message and exit code 2.
- Script MUST send chunks sequentially in argument order.
- Script MUST use curl flags: `-fsS --connect-timeout 5 --max-time 20 --retry 3 --retry-delay 1 --retry-all-errors`.
- Script MUST use `--data-urlencode` for message text.
- Script MUST fail-fast: stop on first chunk failure, propagate exit code.
- Script MUST NOT format, split, or transform messages — caller responsibility.
- Script MUST NOT choose bot or chat — caller passes via args.
- Script MUST live in `ci-shared` at `scripts/notify_telegram.sh`.

## 5. Consequences

- Chunks sent before a failure are delivered and cannot be retracted. Partial delivery is accepted as a reasonable compromise in an async system.
- Callers that need all-or-nothing semantics must handle that themselves (this is not a transport concern).
- Single-message callers pass one chunk — no overhead.

## 6. Non-Goals

- Message formatting (emoji, templates, job-result parsing).
- Auto-splitting long messages at Telegram's 4096-char limit.
- Choosing which bot or chat to use.
- Deciding when to notify.
