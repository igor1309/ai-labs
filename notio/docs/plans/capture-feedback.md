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

## Phase 2 — CaptureFeedbackMessenger and receipt sequencing

**Objective**: build the feedback formatting layer and wire receipt feedback into the webhook route with explicit ordering: HTTP acknowledgment stays fast, and receipt feedback is attempted before capture work begins.

**Key work items**:
- Define `Feedback` enum: `.receipt`, `.success(CapturedItem)`, `.failure`.
- Define `CaptureFeedbackMessenger` protocol: `func send(chatId: Int, feedback: Feedback) async`.
- Implement `TelegramCaptureFeedbackMessenger`: maps `Feedback` to message text, delegates to `MessageSender`, swallows delivery errors with warning log.
- Wire normal webhook requests through a single per-request `Task.detached` created by the route/composition layer.
- Route behavior is fixed: decode the normal capture request, spawn `Task.detached { await messenger.send(chatId: chatId, feedback: .receipt); await captureInBackground(...) }`, then return HTTP 200 immediately without awaiting that task.
- `captureInBackground` must start only after the receipt send attempt finishes (success or swallowed failure), so receipt sequencing is deterministic at the plan level.

**Dependencies**: Phase 1 (`MessageSender`).

**Risks**: detached task sequencing can drift if receipt send and capture start are split across multiple tasks. Mitigation: keep receipt attempt and capture start in the same per-request task.

**Validation**:
- Unit test: `CaptureFeedbackMessenger` maps `.receipt` to `Received. Processing...`.
- Unit test: `CaptureFeedbackMessenger` maps `.success(noteItem)` to `Saved note.`.
- Unit test: `CaptureFeedbackMessenger` maps `.success(linkItemWithTitle)` to `Saved: <title>`.
- Unit test: `CaptureFeedbackMessenger` maps `.success(linkItemNoTitle)` to `Saved link.`.
- Unit test: `CaptureFeedbackMessenger` maps `.failure` to `Failed to save. Try again later.`.
- Unit test: delivery failure is swallowed and logged at warning.
- Integration test: webhook route returns HTTP 200 without waiting for a slow `MessageSender`.
- Integration test: receipt feedback is attempted with the same `chatId` from the accepted webhook request.
- Integration test: receipt feedback attempt happens before capture starts for the same request.
- Integration test: receipt delivery failure is logged and capture still starts.
- Integration test: receipt feedback and capture processing still proceed after the handler returns HTTP 200.
- `swift test` passes.

**Completion signal**: receipt feedback fires on normal webhook requests with correct formatting. Commit.

## Phase 3 — Lock failure surface and wire final outcome feedback

**Objective**: first prove the current capture flow has no throwable failure boundary before `save()`, then wire final success/failure feedback at the save boundary using a `CaptureStore` decorator.

**Key work items**:
- Add characterization coverage that locks the current failure surface:
  - `IngressParser.parse` is non-throwing.
  - `Enricher.enrich` returns `EnrichmentResult` and does not fail the request by throwing.
  - `CaptureService.capture` only observes throwable failure from `store.save`.
- Add a short rationale note directly in this Phase 3 section stating that, because `store.save` is the only throwable failure boundary in the current capture flow, final `.failure` at the store boundary satisfies the spec's terminal failure contract for v0.0.1 without changing `CaptureService`.
- Implement `NotifyingCaptureStore: CaptureStore`: wraps inner store, accepts `chatId` and `CaptureFeedbackMessenger`.
  - On `save()` success: call `messenger.send(chatId:feedback: .success(item))`, return.
  - On `save()` failure: attempt `messenger.send(chatId:feedback: .failure)`, preserve the original store error, and rethrow that original error regardless of notification delivery outcome.
- Wire in webhook route: the per-request task from Phase 2 creates `NotifyingCaptureStore` wrapping the real store with the current `chatId` and messenger, then passes it to `CaptureService`.
- Verify: `CaptureService` is not modified — no new parameters, no new dependencies.

**Dependencies**: Phase 2 (`CaptureFeedbackMessenger`).

**Risks**: future throwable work added before `save()` would invalidate store-only outcome wiring. Mitigation: characterization tests in this phase make that drift visible immediately.

**Validation**:
- Characterization test: enrichment failure still reaches `save()` and does not create a second failure boundary.
- Characterization test: store failure is the terminal failure path observed by `CaptureService`.
- Unit test: decorated store calls inner store's `save()` with item unchanged.
- Unit test: on success, messenger receives `.success(item)` with correct `chatId`.
- Unit test: on failure, messenger receives `.failure` with correct `chatId`, original error rethrown.
- Unit test: messenger delivery failure does not prevent `save()` from succeeding.
- Unit test: if `save()` fails and failure notification delivery also fails, the original store error is rethrown after one `.failure` attempt.
- Integration test: one accepted request emits exactly one final outcome message — success or failure, never both.
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
