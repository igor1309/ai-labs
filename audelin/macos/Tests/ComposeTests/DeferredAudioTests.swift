import CallText
import struct MicrophoneCapture.AudioPiece
import Testing
import TrackFile
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct DeferredAudioTests {

    @Test(arguments: [false, true])
    func attachmentWorksBeforeOrAfterListening(listenFirst: Bool) async throws {

        try await withComposeFolder { folder in
            let listening = Signal()
            let audio = DeferredAudio(listening: { listening.send() })
            #expect(audio.capturedThrough == 0)
            let track = try TrackFile(url: folder.appendingPathComponent("track.caf"))
            let source = AsyncThrowingStream<MicrophoneCapture.AudioPiece, any Error>.makeStream()
            let feed = CaptureFeed(stream: source.stream, track: track)
            defer { source.continuation.finish(); feed.cancel(); audio.finish(); listening.end() }
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
            source.continuation.yield(.init(samples: [0.25, -0.5], sampleRate: 48_000))
            source.continuation.finish()
            try await feed.wait()
            await withTaskCancellationHandler { await listener.value } onCancel: { listener.cancel() }
            await audio.wait()
            #expect(received.all == [.init(start: 0, samples: [0.25, -0.5], sampleRate: 48_000)])
            #expect(audio.capturedThrough == 2 / 48_000.0)
            try await track.close()
        }
    }

    @Test(arguments: [false, true])
    func unattachedListenerEndsByCancellationOrFinish(cancel: Bool) async {

        let listening = Signal(), finished = Signal()
        defer { listening.end(); finished.end() }
        let audio = DeferredAudio(listening: { listening.send() }, finished: { finished.send() })
        let received = Values<Audio>()
        let listener = Task { await audio.listen { received.append($0) } }
        defer { listener.cancel(); audio.finish() }
        await listening.next()
        if cancel { listener.cancel() } else { audio.finish() }
        await withTaskCancellationHandler { await listener.value } onCancel: { listener.cancel() }
        await finished.next()
        await audio.wait()
        #expect(received.all.isEmpty)
        #expect(audio.capturedThrough == 0)
    }
}
