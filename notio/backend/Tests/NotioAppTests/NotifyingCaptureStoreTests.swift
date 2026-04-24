import Foundation
import Testing
@testable import NotioApp

@Suite("NotifyingCaptureStore")
struct NotifyingCaptureStoreTests {
    @Test func test_save_shouldForwardItemToInnerStore() async throws {
        let inner = SpyCaptureStore()
        let messenger = RecordingFeedbackMessenger()
        let sut = makeSUT(inner: inner, chatId: 1, messenger: messenger)
        let item = makeNoteItem()

        try await sut.save(item)

        let saved = await inner.savedItems
        #expect(saved == [item])
    }

    @Test func test_save_shouldSendSuccessOnSaveSuccess() async throws {
        let inner = SpyCaptureStore()
        let messenger = RecordingFeedbackMessenger()
        let item = makeNoteItem()
        let sut = makeSUT(inner: inner, chatId: 42, messenger: messenger)

        try await sut.save(item)

        let feedbacks = await messenger.feedbacks
        #expect(feedbacks.count == 1)
        #expect(feedbacks.first?.feedback == .success(item))
        #expect(feedbacks.first?.chatId == 42)
    }

    @Test func test_save_shouldSendFailureOnSaveFailure() async throws {
        let inner = ThrowingCaptureStore()
        let messenger = RecordingFeedbackMessenger()
        let sut = makeSUT(inner: inner, chatId: 42, messenger: messenger)

        do {
            try await sut.save(makeNoteItem())
        } catch {}

        let feedbacks = await messenger.feedbacks
        #expect(feedbacks.count == 1)
        #expect(feedbacks.first?.feedback == .failure)
        #expect(feedbacks.first?.chatId == 42)
    }

    @Test func test_save_shouldRethrowOriginalErrorOnFailure() async throws {
        let inner = ThrowingCaptureStore()
        let messenger = RecordingFeedbackMessenger()
        let sut = makeSUT(inner: inner, chatId: 1, messenger: messenger)

        await #expect(throws: ThrowingCaptureStore.Failure.self) {
            try await sut.save(makeNoteItem())
        }
    }

    @Test func test_save_shouldNotPreventSaveWhenMessengerFails() async throws {
        let inner = SpyCaptureStore()
        let messenger = FailingFeedbackMessenger()
        let sut = makeSUT(inner: inner, chatId: 1, messenger: messenger)
        let item = makeNoteItem()

        try await sut.save(item)

        let saved = await inner.savedItems
        #expect(saved == [item])
    }

    @Test func test_save_shouldRethrowOriginalErrorWhenBothFail() async throws {
        let inner = ThrowingCaptureStore()
        let messenger = FailingFeedbackMessenger()
        let sut = makeSUT(inner: inner, chatId: 1, messenger: messenger)

        await #expect(throws: ThrowingCaptureStore.Failure.self) {
            try await sut.save(makeNoteItem())
        }
    }
}

// MARK: - Helpers

private extension NotifyingCaptureStoreTests {
    typealias SUT = NotifyingCaptureStore

    func makeSUT(inner: some CaptureStore, chatId: Int, messenger: some CaptureFeedbackMessenger) -> SUT {
        NotifyingCaptureStore(inner: inner, chatId: chatId, messenger: messenger)
    }

    func makeNoteItem() -> CapturedItem {
        CapturedItem(
            kind: .note,
            sourceType: nil,
            capturedAt: Date(),
            url: nil,
            note: "test",
            enrichment: .none,
            capturedTitle: nil,
            capturedDescription: nil
        )
    }
}

private struct FailingFeedbackMessenger: CaptureFeedbackMessenger {
    func send(chatId: Int, feedback: Feedback) async {
        // Simulates a messenger that silently fails (real impl swallows errors)
    }
}
