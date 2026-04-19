---
title: Two-Phase Capture Feedback
date: 2026-04-19
model: gpt-5.4
description: "Defines the two-message Telegram feedback contract for receipt acknowledgement and final capture outcome."
version: 0.0.1
status: draft
type: spec
---

# Two-Phase Capture Feedback

## Goal

Attempt two Telegram feedback deliveries for each normal capture request: an immediate receipt acknowledgement and a final outcome message, while keeping Telegram transport concerns out of the capture service.

## Public interface

### Feedback messenger protocol

```swift
public protocol CaptureFeedbackMessenger: Sendable {
    func send(chatId: Int, feedback: Feedback) async
}

public enum Feedback: Equatable, Sendable {
    case receipt
    case success(CapturedItem)
    case failure
}
```

### Message sender protocol

```swift
public protocol MessageSender: Sendable {
    func send(chatId: Int, text: String) async throws
}
```

### Telegram sender (implementation)

```swift
public struct TelegramMessageSender: MessageSender, Sendable {
    public init(botToken: String)
    public func send(chatId: Int, text: String) async throws
}
```

## Behavior rules

### Receipt feedback

- For a normal Telegram capture request with a message text and `chatId`, receipt feedback is attempted immediately after the request is accepted into the normal capture flow.
- Receipt feedback is sent before background capture processing starts.
- Receipt feedback is represented as `Feedback.receipt`.
- Receipt delivery failure is logged at warning level and swallowed — it does not prevent capture processing.

### Outcome feedback

- After capture processing finishes, exactly one final outcome feedback attempt is made for the request.
- On successful persistence: attempt `Feedback.success(item)`, then return.
- On failed capture processing or failed persistence: attempt `Feedback.failure`.
- Final-message delivery failure is logged at warning level and swallowed — it does not alter the capture outcome.

### Composition rules

- The webhook route owns receipt feedback because it owns request receipt at the Telegram boundary.
- The capture service remains unchanged. It does not accept `chatId` and does not call feedback APIs directly.
- Outcome feedback must be wired at a boundary where both the final capture outcome and the request `chatId` are available.
- The spec does not require a specific internal pattern for outcome feedback. A decorator is allowed, but not mandated.

### Message format

On receipt:
```
Received. Processing...
```

On success (note):
```
Saved note.
```

On success (link, title available):
```
Saved: <captured_title>
```

On success (link, no title):
```
Saved link.
```

On failure:
```
Failed to save. Try again later.
```

Messages are plain text. Keep them short — they are acknowledgements and receipts, not reports.

### Message sender

- `CaptureFeedbackMessenger` is responsible for mapping `Feedback.receipt`, `Feedback.success(item)`, and `Feedback.failure` to short Telegram message text.
- `TelegramMessageSender` calls `POST https://api.telegram.org/bot<token>/sendMessage` with `chat_id` and `text`.
- Timeout: 5 seconds. Timeout produces a warning log, not a retry.
- Non-2xx response is treated as delivery failure (logged, swallowed).

### Configuration

- `NOTIO_TELEGRAM_BOT_TOKEN`: required for Telegram feedback delivery.
- When `NOTIO_TELEGRAM_BOT_TOKEN` is absent, the server must fail startup rather than run normal Telegram capture without feedback.

## Tests (required)

1. Receipt feedback attempts `Received. Processing...` to the correct `chatId`.
2. Receipt feedback is attempted before background capture processing starts.
3. Receipt delivery failure is logged at warning level and does not prevent capture processing.
4. Successful capture attempts exactly one final success message to the correct `chatId`.
5. Failed capture attempts exactly one final failure message to the correct `chatId`.
6. A request never sends both success and failure final messages.
7. Final-message delivery failure is logged at warning level and swallowed.
8. Note success formats as `Saved note.`.
9. Link success with title formats as `Saved: <title>`.
10. Link success without title formats as `Saved link.`.
11. Failure formats as `Failed to save. Try again later.`.
12. Server startup fails when `NOTIO_TELEGRAM_BOT_TOKEN` is absent.
13. The capture service interface remains unchanged and does not accept `chatId`.

## Done criteria

- `Feedback`, `CaptureFeedbackMessenger`, `MessageSender`, and `TelegramMessageSender` exist.
- The webhook route attempts immediate receipt feedback for normal capture requests.
- The system attempts exactly one final success/failure feedback delivery after processing finishes.
- Server startup rejects normal Telegram capture mode when feedback configuration is missing.
- Capture service is not modified and does not accept Telegram transport metadata.
- All required tests pass.
