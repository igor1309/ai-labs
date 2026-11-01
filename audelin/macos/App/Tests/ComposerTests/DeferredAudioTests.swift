import struct SideText.Audio
import Synchronization
import Testing
@testable import Composer

@Suite(.timeLimit(.minutes(1)))
struct DeferredAudioTests {

    @Test(arguments: [false, true])
    func attachmentWorksBeforeOrAfterListening(listenFirst: Bool) async {

        let listening = Signal()
        let audio = DeferredAudio(listening: { listening.send() })
        #expect(audio.capturedThrough == 0)
        #expect(!audio.hasCapture)
        let feed = FakeCaptureAudio()
        defer { feed.finish(); audio.finish(); listening.end() }
        let received = Values<Audio>()
        let listener: Task<Void, Never>
        if listenFirst {
            listener = Task { await audio.listen { received.append($0) } }
            await listening.next()
            audio.attach(feed)
        } else {
            audio.attach(feed)
            listener = Task { await audio.listen { received.append($0) } }
        }
        defer { listener.cancel() }
        #expect(audio.hasCapture)
        feed.give(.init(start: 0, samples: [0.25, -0.5], sampleRate: 48_000))
        feed.finish()
        await withTaskCancellationHandler { await listener.value } onCancel: { listener.cancel() }
        #expect(received.all == [.init(start: 0, samples: [0.25, -0.5], sampleRate: 48_000)])
        #expect(audio.capturedThrough == 2 / 48_000.0)
    }

    @Test(arguments: [false, true])
    func unattachedListenerEndsByCancellationOrFinish(cancel: Bool) async {

        let listening = Signal()
        defer { listening.end() }
        let audio = DeferredAudio(listening: { listening.send() })
        let received = Values<Audio>()
        let listener = Task { await audio.listen { received.append($0) } }
        defer { listener.cancel(); audio.finish() }
        await listening.next()
        if cancel { listener.cancel() } else { audio.finish() }
        await withTaskCancellationHandler { await listener.value } onCancel: { listener.cancel() }
        #expect(received.all.isEmpty)
        #expect(audio.capturedThrough == 0)
    }

    @Test func capturedThroughIncludesAudioBeforeTheListenerAcceptsIt() async {

        let audio = DeferredAudio(), held = Signal(), release = Signal()
        let capture = FakeCaptureAudio()
        let received = Values<Audio>()
        let listener = Task {
            await audio.listen { piece in
                if piece.start == 0 { held.send(); await release.next() }
                received.append(piece)
            }
        }
        defer { capture.finish(); listener.cancel(); held.end(); release.end(); audio.finish() }
        audio.attach(capture)
        capture.give(.init(start: 0, samples: [0.25, -0.5], sampleRate: 48_000))
        await held.next()
        capture.give(.init(start: 2 / 48_000, samples: [0.5], sampleRate: 24_000))
        capture.finish()
        await audio.drain()
        #expect(audio.capturedThrough == 2 / 48_000.0 + 1 / 24_000.0)
        #expect(received.all.isEmpty)
        release.end()
        await listener.value
        #expect(received.all == [
            Audio(start: 0, samples: [0.25, -0.5], sampleRate: 48_000),
            Audio(start: 2 / 48_000, samples: [0.5], sampleRate: 24_000),
        ])
    }
}

private final class FakeCaptureAudio: CaptureAudio {

    private let audio = AsyncStream<Audio>.makeStream()
    private let position = Mutex(0.0)

    var capturedThrough: Double { position.withLock { $0 } }

    func give(_ piece: Audio) {

        position.withLock { $0 = piece.end }
        audio.continuation.yield(piece)
    }

    func finish() { audio.continuation.finish() }

    func listen(_ receive: @escaping @Sendable (Audio) async -> Void) async {

        for await piece in audio.stream { await receive(piece) }
    }
}
