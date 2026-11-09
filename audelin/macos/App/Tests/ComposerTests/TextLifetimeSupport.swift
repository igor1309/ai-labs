import struct SideText.Audio
import protocol SideText.LiveAudio
import struct FillIn.Audio
import protocol FillIn.WrittenTrack
import LiveText
import Synchronization

/// A delivery acknowledges the side's receipt, including cancellation.
final class TextAudio: LiveAudio, Sendable {

    private struct Delivery: Sendable {

        let audio: SideText.Audio
        let handled: Signal
    }

    private let position = Mutex(0.0)
    private let stream: AsyncStream<Delivery>
    private let continuation: AsyncStream<Delivery>.Continuation
    var capturedThrough: Double { position.withLock { $0 } }

    init() {

        (stream, continuation) = AsyncStream.makeStream()
    }

    func listen(_ receive: @escaping @Sendable (SideText.Audio) async -> Void) async {

        for await delivery in stream {
            await receive(delivery.audio)
            delivery.handled.send()
        }
    }

    func send(_ audio: SideText.Audio) async {

        capture(audio)
        let handled = Signal()
        continuation.yield(Delivery(audio: audio, handled: handled))
        await handled.next()
    }

    func capture(_ audio: SideText.Audio) { position.withLock { $0 = max($0, audio.end) } }

    func end() { continuation.finish() }
}

struct TextTrack: FillIn.WrittenTrack {

    let chunks: [FillIn.Audio]

    func read(from: Double, through: Double) async throws -> [FillIn.Audio] {

        chunks.filter { $0.end > from && $0.start < through }
    }
}

/// Releasing the recognizer proves LiveText and its listening task released their ownership.
final class LifetimeRecognizer: Recognizer, Sendable {

    private let released: Signal
    private let finishes: Values<Bool>

    init(released: Signal, finishes: Values<Bool>) {

        self.released = released
        self.finishes = finishes
    }

    func hear(_ chunk: AudioChunk) async throws -> Hearing { Hearing(words: []) }

    func finish() async throws -> Hearing {

        finishes.append(true)
        return Hearing(words: [])
    }

    deinit { released.send() }
}
