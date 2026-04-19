public struct NotifyingCaptureStore: CaptureStore, Sendable {

    private let inner: any CaptureStore
    private let chatId: Int
    private let messenger: any CaptureFeedbackMessenger

    public init(inner: any CaptureStore, chatId: Int, messenger: any CaptureFeedbackMessenger) {
        self.inner = inner
        self.chatId = chatId
        self.messenger = messenger
    }

    public func save(_ item: CapturedItem) async throws {
        do {
            try await inner.save(item)
            await messenger.send(chatId: chatId, feedback: .success(item))
        } catch {
            await messenger.send(chatId: chatId, feedback: .failure)
            throw error
        }
    }
}
