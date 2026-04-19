import Foundation
import Hummingbird
import HummingbirdTesting
import Logging
import Testing
@testable import NotioApp

@Suite("WebhookFeedback")
struct WebhookFeedbackTests {
    @Test func test_normalRequest_shouldReturn200WithoutWaitingForSlowSender() async throws {
        let sender = SlowMessageSender()
        let app = makeApp(sender: sender, store: SpyCaptureStore())
        let body = makeTelegramBody(chatId: 1, text: "hello")

        try await app.test(.router) { client in
            try await client.execute(uri: "/hook", method: .post, body: body) { response in
                #expect(response.status == .ok)
            }
        }
    }

    @Test func test_normalRequest_shouldAttemptReceiptWithChatId() async throws {
        let spy = RecordingFeedbackMessenger()
        let store = SpyCaptureStore()
        let app = makeApp(messenger: spy, store: store)
        let body = makeTelegramBody(chatId: 42, text: "hello")

        try await app.test(.router) { client in
            try await client.execute(uri: "/hook", method: .post, body: body) { _ in }
        }

        _ = await store.waitForSave()
        let feedbacks = await spy.feedbacks
        let receipt = try #require(feedbacks.first(where: { $0.feedback == .receipt }))
        #expect(receipt.chatId == 42)
    }

    @Test func test_normalRequest_shouldAttemptReceiptBeforeCaptureStarts() async throws {
        let spy = RecordingFeedbackMessenger()
        let orderTracker = OrderTracker()
        let store = OrderTrackingStore(tracker: orderTracker)
        let orderMessenger = OrderTrackingMessenger(inner: spy, tracker: orderTracker)
        let app = makeApp(messenger: orderMessenger, store: store)
        let body = makeTelegramBody(chatId: 1, text: "hello")

        try await app.test(.router) { client in
            try await client.execute(uri: "/hook", method: .post, body: body) { _ in }
        }

        _ = await store.waitForSave()
        let events = await orderTracker.events
        let receiptIndex = events.firstIndex(of: "receipt")
        let saveIndex = events.firstIndex(of: "save")
        let receiptIdx = try #require(receiptIndex)
        let saveIdx = try #require(saveIndex)
        #expect(receiptIdx < saveIdx)
    }

    @Test func test_normalRequest_shouldStillCaptureWhenReceiptFails() async throws {
        let sender = ThrowingMessageSender()
        let store = SpyCaptureStore()
        let handler = CapturingLogHandler()
        let logger = Logger(label: "test") { _ in handler }
        let messenger = TelegramCaptureFeedbackMessenger(sender: sender, logger: logger)
        let app = makeApp(messenger: messenger, store: store)
        let body = makeTelegramBody(chatId: 1, text: "hello")

        try await app.test(.router) { client in
            try await client.execute(uri: "/hook", method: .post, body: body) { _ in }
        }

        let item = await store.waitForSave()
        #expect(item.kind == .note)
    }

    @Test func test_normalRequest_shouldEmitExactlyOneOutcomeMessage() async throws {
        let spy = RecordingFeedbackMessenger()
        let store = SpyCaptureStore()
        let app = makeApp(messenger: spy, store: store)
        let body = makeTelegramBody(chatId: 1, text: "hello")

        try await app.test(.router) { client in
            try await client.execute(uri: "/hook", method: .post, body: body) { _ in }
        }

        _ = await store.waitForSave()
        let feedbacks = await spy.feedbacks
        let outcomes = feedbacks.filter { $0.feedback != .receipt }
        #expect(outcomes.count == 1)
        #expect(outcomes.first?.feedback == .success(CapturedItem(
            kind: .note,
            sourceType: nil,
            capturedAt: (await store.savedItems.first!).capturedAt,
            url: nil,
            note: "hello",
            enrichment: .none,
            capturedTitle: nil,
            capturedDescription: nil
        )))
    }

    @Test func test_normalRequest_feedbackAndCaptureShouldProceedAfterHandlerReturns() async throws {
        let spy = RecordingFeedbackMessenger()
        let store = SpyCaptureStore()
        let app = makeApp(messenger: spy, store: store)
        let body = makeTelegramBody(chatId: 1, text: "a note")

        try await app.test(.router) { client in
            try await client.execute(uri: "/hook", method: .post, body: body) { response in
                #expect(response.status == .ok)
            }
        }

        let item = await store.waitForSave()
        #expect(item.kind == .note)
        let feedbacks = await spy.feedbacks
        #expect(feedbacks.contains(where: { $0.feedback == .receipt }))
    }
}

// MARK: - Helpers

private extension WebhookFeedbackTests {
    func makeApp(
        messenger: some CaptureFeedbackMessenger = RecordingFeedbackMessenger(),
        sender: some MessageSender = SpyMessageSender(),
        store: SpyCaptureStore = SpyCaptureStore()
    ) -> some ApplicationProtocol {

        let logger = Logger(label: "test", factory: SwiftLogNoOpLogHandler.init)
        let effectiveMessenger: any CaptureFeedbackMessenger =
            if messenger is RecordingFeedbackMessenger {
                messenger
            } else {
                TelegramCaptureFeedbackMessenger(sender: sender, logger: logger)
            }
        return buildApp(
            config: Config(port: 8080, version: "test", webhookPath: "hook"),
            logger: logger,
            store: store,
            enricher: NullEnricher(),
            messenger: effectiveMessenger
        )
    }

    func makeApp(
        messenger: some CaptureFeedbackMessenger,
        store: some CaptureStore
    ) -> some ApplicationProtocol {

        buildApp(
            config: Config(port: 8080, version: "test", webhookPath: "hook"),
            logger: Logger(label: "test", factory: SwiftLogNoOpLogHandler.init),
            store: store,
            enricher: NullEnricher(),
            messenger: messenger
        )
    }

    func makeTelegramBody(chatId: Int, text: String) -> ByteBuffer {
        ByteBuffer(string: """
        {"update_id":1,"message":{"message_id":1,"chat":{"id":\(chatId)},"date":0,"text":"\(text)"}}
        """)
    }
}

actor RecordingFeedbackMessenger: CaptureFeedbackMessenger {
    struct Record: Sendable {
        let chatId: Int
        let feedback: Feedback
    }

    private(set) var feedbacks: [Record] = []

    func send(chatId: Int, feedback: Feedback) async {
        feedbacks.append(Record(chatId: chatId, feedback: feedback))
    }
}

private struct SlowMessageSender: MessageSender {
    func send(chatId: Int, text: String) async throws {
        try await Task.sleep(for: .milliseconds(500))
    }
}

private struct ThrowingMessageSender: MessageSender {
    func send(chatId: Int, text: String) async throws {
        throw SendError()
    }

    struct SendError: Error {}
}

actor OrderTracker {
    private(set) var events: [String] = []

    func record(_ event: String) {
        events.append(event)
    }
}

private struct OrderTrackingMessenger: CaptureFeedbackMessenger {
    let inner: RecordingFeedbackMessenger
    let tracker: OrderTracker

    func send(chatId: Int, feedback: Feedback) async {
        await inner.send(chatId: chatId, feedback: feedback)
        if feedback == .receipt {
            await tracker.record("receipt")
        }
    }
}

private actor OrderTrackingStore: CaptureStore {
    let tracker: OrderTracker
    private var continuation: CheckedContinuation<CapturedItem, Never>?
    private var savedItem: CapturedItem?

    init(tracker: OrderTracker) {
        self.tracker = tracker
    }

    func save(_ item: CapturedItem) async throws {
        await tracker.record("save")
        savedItem = item
        continuation?.resume(returning: item)
        continuation = nil
    }

    func waitForSave() async -> CapturedItem {
        if let item = savedItem { return item }
        return await withCheckedContinuation { self.continuation = $0 }
    }
}
