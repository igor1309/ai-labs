import protocol SideText.LiveAudio
import struct SideText.Audio
import Synchronization

protocol CaptureAudio: Sendable {

    var capturedThrough: Double { get }
    func listen(_ receive: @escaping @Sendable (Audio) async -> Void) async
}

/// Keeps the destination subscribed while its capture is still being made.
final class DeferredAudio: SideText.LiveAudio, Sendable {

    private let capture = Mutex<(any CaptureAudio)?>(nil)
    private let attachment = AsyncStream<any CaptureAudio>.makeStream()
    private let audio = AsyncStream<Audio>.makeStream()
    private let translating: Task<Void, Never>
    private let listening: @Sendable () -> Void

    var capturedThrough: Double { capture.withLock { $0?.capturedThrough ?? 0 } }
    var hasCapture: Bool { capture.withLock { $0 != nil } }

    init(
        listening: @escaping @Sendable () -> Void = {},
        beforeDelivery: @escaping @Sendable () async -> Void = {}
    ) {

        self.listening = listening
        let attachment = attachment.stream, audio = audio.continuation
        translating = Task {
            defer { audio.finish() }
            await beforeDelivery()
            for await capture in attachment {
                await capture.listen { audio.yield($0) }
            }
        }
    }

    func attach(_ capture: any CaptureAudio) {

        self.capture.withLock { $0 = capture }
        attachment.continuation.yield(capture)
        attachment.continuation.finish()
    }

    func listen(_ receive: @escaping @Sendable (Audio) async -> Void) async {

        listening()
        for await piece in audio.stream {
            guard !Task.isCancelled else { return }
            await receive(piece)
        }
    }

    func finish() { attachment.continuation.finish() }

    func drain() async { await translating.value }

    deinit {

        translating.cancel()
        attachment.continuation.finish()
        audio.continuation.finish()
    }
}
