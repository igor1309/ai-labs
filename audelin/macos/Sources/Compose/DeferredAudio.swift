import CallText
import Synchronization

/// Keeps the destination subscribed while its capture is still being made.
final class DeferredAudio: LiveAudio, Sendable {

    private let feed = Mutex<CaptureFeed?>(nil)
    private let attachment = AsyncStream<CaptureFeed>.makeStream()
    private let ended = AsyncStream<Void>.makeStream()
    private let listening: @Sendable () -> Void
    private let finished: @Sendable () -> Void

    var capturedThrough: Double { feed.withLock { $0?.capturedThrough ?? 0 } }

    init(listening: @escaping @Sendable () -> Void = {}, finished: @escaping @Sendable () -> Void = {}) {

        self.listening = listening
        self.finished = finished
    }

    func attach(_ feed: CaptureFeed) {

        self.feed.withLock { $0 = feed }
        attachment.continuation.yield(feed)
        attachment.continuation.finish()
    }

    func listen(_ receive: @escaping @Sendable (Audio) async -> Void) async {

        defer { ended.continuation.finish(); finished() }
        listening()
        for await feed in attachment.stream {
            guard !Task.isCancelled else { return }
            await feed.listen(receive)
        }
    }

    func finish() { attachment.continuation.finish() }

    /// The live reader acknowledges every written delivery before text stops.
    func wait() async {

        for await _ in ended.stream {}
    }
}
