import protocol CallText.LiveAudio
import struct CallText.Audio
import Synchronization

/// Keeps the destination subscribed while its capture is still being made.
final class DeferredAudio: CallText.LiveAudio, Sendable {

    private let capture = Mutex<CaptureAudio?>(nil)
    private let attachment = AsyncStream<CaptureAudio>.makeStream()
    private let audio = AsyncStream<Audio>.makeStream()
    private let ended = AsyncStream<Void>.makeStream()
    private let translating: Task<Void, Never>
    private let listening: @Sendable () -> Void
    private let finished: @Sendable () -> Void

    var capturedThrough: Double { capture.withLock { $0?.capturedThrough ?? 0 } }

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

    func attach(_ capture: CaptureAudio) {

        self.capture.withLock { $0 = capture }
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
