---
date: 2026-04-19
model: claude-opus-4-6
description: "Implementation plan: two-phase Telegram capture feedback per ADR-006 and capture-feedback spec v0.0.1"
---

# Two-Phase Capture Feedback

Implements ADR-006 (capture feedback as cross-cutting concern) and spec capture-feedback-v0.0.1.

## Goal

Add immediate receipt feedback and final outcome feedback for Telegram capture requests. The capture service remains unchanged — feedback is wired at the boundary.

## Execution lock

Worktree required: no
Expected worktree: root
Expected branch: feat/notio-capture-feedback
Preflight check: [ ] done

## Scope guardrails

- No changes to `CaptureService` interface or internals.
- No changes to `CapturedItem`, `IngressParser`, or enrichment logic.
- No retry or delivery guarantee for feedback messages (ADR-006 non-goal).
- No feedback for non-Telegram ingress (ADR-006 non-goal).
- Message formatting is plain text only — no markdown, no rich media.

## ADR traceability matrix

| ADR-006 invariant | Phase |
|---|---|
| Every normal capture request MUST attempt immediate receipt feedback | Phase 2 |
| Every normal capture request MUST attempt exactly one final outcome feedback | Phase 3 |
| Capture service MUST NOT accept `chatId` or Telegram transport metadata | Phase 3 (verified) |
| Capture service MUST NOT orchestrate or trigger feedback directly | Phase 3 (verified) |
| Telegram transport metadata MUST remain outside canonical item | Phase 3 (verified) |
| Feedback delivery failure MUST NOT alter persistence outcome | Phase 1, 3 |
| Server MUST fail startup when feedback config is missing | Phase 4 |
| Internal wiring MUST preserve ADR-001 capture-service boundary | Phase 3 (verified) |

## Phase 1 — MessageSender and TelegramMessageSender

**Objective**: build the low-level Telegram `sendMessage` transport.

**Key work items**:
- Define `MessageSender` protocol: `func send(chatId: Int, text: String) async throws`.
- Implement `TelegramMessageSender`: POST to `https://api.telegram.org/bot<token>/sendMessage`, 5-second timeout, throws on non-2xx.
- Protocol lives with its client (per repo convention).

**Dependencies**: none (foundational slice).

**Risks**: Telegram Bot API shape assumptions — verify against actual API docs.

**Validation**:
- Unit test: `TelegramMessageSender` produces correct URL and request body for given token/chatId/text.
- Unit test: non-2xx response throws.
- Unit test: timeout throws.
- `swift test` passes.

**Completion signal**: `MessageSender` protocol and `TelegramMessageSender` exist with passing tests. Commit.

## Phase 2 — CaptureFeedbackMessenger and receipt feedback

**Objective**: build the feedback formatting layer and wire receipt feedback into the webhook route.

**Key work items**:
- Define `Feedback` enum: `.receipt`, `.success(CapturedItem)`, `.failure`.
- Define `CaptureFeedbackMessenger` protocol: `func send(chatId: Int, feedback: Feedback) async`.
- Implement `TelegramCaptureFeedbackMessenger`: maps `Feedback` to message text, delegates to `MessageSender`, swallows delivery errors with warning log.
- Wire receipt feedback in webhook route: after decoding a normal capture request, call `messenger.send(chatId:feedback: .receipt)` before `captureInBackground`.

**Dependencies**: Phase 1 (`MessageSender`).

**Risks**: receipt feedback adds latency before the HTTP 200 ack if done synchronously. Consider: receipt is fire-and-forget — send it in a detached task so it doesn't delay the webhook response.

**Validation**:
- Unit test: `CaptureFeedbackMessenger` maps `.receipt` to `Received. Processing...`.
- Unit test: `CaptureFeedbackMessenger` maps `.success(noteItem)` to `Saved note.`.
- Unit test: `CaptureFeedbackMessenger` maps `.success(linkItemWithTitle)` to `Saved: <title>`.
- Unit test: `CaptureFeedbackMessenger` maps `.success(linkItemNoTitle)` to `Saved link.`.
- Unit test: `CaptureFeedbackMessenger` maps `.failure` to `Failed to save. Try again later.`.
- Unit test: delivery failure is swallowed and logged at warning.
- Integration test: webhook route sends receipt feedback before capture starts.
- `swift test` passes.

**Completion signal**: receipt feedback fires on normal webhook requests with correct formatting. Commit.

## Phase 3 — Outcome feedback via store decorator

**Objective**: wire final success/failure feedback after persistence using a `CaptureStore` decorator.

**Key work items**:
- Implement `NotifyingCaptureStore: CaptureStore`: wraps inner store, accepts `chatId` and `CaptureFeedbackMessenger`.
  - On `save()` success: call `messenger.send(chatId:feedback: .success(item))`, return.
  - On `save()` failure: call `messenger.send(chatId:feedback: .failure)`, rethrow original error.
- Wire in webhook route: `captureInBackground` creates `NotifyingCaptureStore` wrapping the real store with the current `chatId` and messenger, passes it to `CaptureService`.
- Verify: `CaptureService` is not modified — no new parameters, no new dependencies.

**Dependencies**: Phase 2 (`CaptureFeedbackMessenger`).

**Risks**: per-request store allocation — verify no performance concern at expected volume (low, personal bot).

**Validation**:
- Unit test: decorated store calls inner store's `save()` with item unchanged.
- Unit test: on success, messenger receives `.success(item)` with correct `chatId`.
- Unit test: on failure, messenger receives `.failure` with correct `chatId`, original error rethrown.
- Unit test: messenger delivery failure does not prevent `save()` from succeeding.
- Verify: `CaptureService.swift` has zero diff.
- `swift test` passes.

**Completion signal**: full two-phase feedback works end-to-end in tests. Commit.

## Phase 4 — Mandatory startup gate and configuration

**Objective**: enforce that the server cannot start in normal Telegram capture mode without feedback configuration.

**Key work items**:
- Add `NOTIO_TELEGRAM_BOT_TOKEN` to `Config`.
- In composition root (`main.swift` / `App.swift`): when bot token is absent and diagnostic mode is nil (normal mode), fail startup with a clear error.
- Update `.env.example` with `NOTIO_TELEGRAM_BOT_TOKEN=`.
- Update README env vars table.

**Dependencies**: Phase 3 (feedback wiring exists to use the token).

**Risks**: breaks existing deployments that lack the token. Mitigation: deploy the new env var to VPS `.env` before tagging the release.

**Validation**:
- Unit test: config without bot token in normal mode throws startup error.
- Unit test: config without bot token in diagnostic mode starts successfully (diagnostics don't need feedback).
- `swift test` passes.

**Completion signal**: server refuses to start without bot token in normal mode. Commit.

## Phase 5 — Deploy and verify

**Objective**: deploy and verify two-phase feedback end-to-end on production.

**Key work items**:
- Add `NOTIO_TELEGRAM_BOT_TOKEN` to VPS `/opt/notio/.env`.
- Bump `release.toml` version.
- Update `notio/docs/log.md` and `docs/log.md`.
- Push, create PR, merge, tag, deploy.
- Send test messages to `@NotioInboxBot`: note, public link, private link.
- Verify two Telegram replies per message (receipt + outcome).
- Check VPS logs for any warning-level notification failures.

**Dependencies**: Phase 4, VPS env var configured.

**Risks**: Telegram bot token permissions — ensure the token has `sendMessage` capability.

**Validation**:
- Manual: send note → receive "Received. Processing..." then "Saved note.".
- Manual: send public GitHub link → receive receipt then "Saved: <repo-name>".
- Manual: send private repo link → receive receipt then "Saved link." (enrichment fails, item saved).
- `docker logs notio` shows no warning-level feedback errors for successful deliveries.

**Completion signal**: two-phase feedback verified end-to-end on production. Spec moved to `implemented/`.

## Done criteria

- `MessageSender`, `TelegramMessageSender`, `Feedback`, `CaptureFeedbackMessenger`, `NotifyingCaptureStore` exist.
- Receipt feedback fires immediately on normal capture requests.
- Outcome feedback fires after persistence via store decorator.
- `CaptureService` is unmodified.
- Server refuses startup without bot token in normal mode.
- All tests pass, deployed, verified end-to-end.
- Spec moved to `notio/docs/specs/implemented/`.
