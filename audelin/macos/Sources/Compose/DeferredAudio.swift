import CallText
import class RecordedCapture.RecordedCapture
import Synchronization

/// Keeps the destination subscribed while its capture is still being made.
final class DeferredAudio: LiveAudio, Sendable {

    private final class Position: Sendable {

        let value = Mutex(0.0)
    }

    private let position = Position()
    private let attachment = AsyncStream<RecordedCapture>.makeStream()
    private let audio = AsyncStream<Audio>.makeStream()
    private let ended = AsyncStream<Void>.makeStream()
    private let translating: Task<Void, Never>
    private let listening: @Sendable () -> Void
    private let finished: @Sendable () -> Void

    var capturedThrough: Double { position.value.withLock { $0 } }

    init(
        listening: @escaping @Sendable () -> Void = {}, finished: @escaping @Sendable () -> Void = {},
        beforeDelivery: @escaping @Sendable () async -> Void = {}
    ) {

        self.listening = listening
        self.finished = finished
        let attachment = attachment.stream, audio = audio.continuation
        translating = Task {
            defer { audio.finish() }
            await beforeDelivery()
            for await capture in attachment {
                for await piece in await capture.listen() {
                    audio.yield(Audio(start: piece.start, samples: piece.samples, sampleRate: piece.sampleRate))
                }
            }
        }
    }

    func captured(_ piece: CapturedPiece) {

        position.value.withLock { $0 += Double(piece.samples.count) / piece.sampleRate }
    }

    func attach(_ capture: RecordedCapture) {

        attachment.continuation.yield(capture)
        attachment.continuation.finish()
    }

    func listen(_ receive: @escaping @Sendable (Audio) async -> Void) async {

        defer { ended.continuation.finish(); finished() }
        listening()
        for await piece in audio.stream {
            guard !Task.isCancelled else { return }
            await receive(piece)
        }
    }

    func finish() { attachment.continuation.finish() }

    func drain() async { await translating.value }

    /// The live reader acknowledges every written delivery before text stops.
    func wait() async {

        for await _ in ended.stream {}
    }

    deinit {

        translating.cancel()
        attachment.continuation.finish()
        audio.continuation.finish()
    }
}
