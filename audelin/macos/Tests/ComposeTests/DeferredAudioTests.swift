import CallText
import class RecordedCapture.RecordedCapture
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
            let source = AsyncThrowingStream<CapturedPiece, any Error>.makeStream()
            let capture = CaptureAdapter(begin: {
                StartedCapture(stream: source.stream, stop: { source.continuation.finish() })
            }, unpack: { $0 }, captured: { audio.captured($0) })
            let feed = RecordedCapture(capture: capture, track: CaptureTrack(track: track))
            defer { source.continuation.finish(); audio.finish(); listening.end() }
            try await feed.start()
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
            try await feed.stop()
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

    @Test func capturedThroughIncludesAudioBeforeTheListenerAcceptsIt() async throws {

        try await withComposeFolder { folder in
            let audio = DeferredAudio(), held = Signal(), release = Signal()
            let track = try TrackFile(url: folder.appendingPathComponent("track.caf"))
            let source = AsyncThrowingStream<CapturedPiece, any Error>.makeStream()
            let capture = CaptureAdapter(begin: {
                StartedCapture(stream: source.stream, stop: { source.continuation.finish() })
            }, unpack: { $0 }, captured: { audio.captured($0) })
            let recorded = RecordedCapture(capture: capture, track: CaptureTrack(track: track))
            let received = Values<Audio>()
            let listener = Task {
                await audio.listen { piece in
                    if piece.start == 0 { held.send(); await release.next() }
                    received.append(piece)
                }
            }
            defer { source.continuation.finish(); listener.cancel(); release.end(); audio.finish() }
            audio.attach(recorded)
            try await recorded.start()
            source.continuation.yield(.init(samples: [0.25, -0.5], sampleRate: 48_000))
            await held.next()
            source.continuation.yield(.init(samples: [0.5], sampleRate: 24_000))
            try await recorded.stop()
            await audio.drain()
            #expect(audio.capturedThrough == 2 / 48_000.0 + 1 / 24_000.0)
            #expect(received.all.isEmpty)
            release.end()
            await listener.value
            #expect(received.all == [
                Audio(start: 0, samples: [0.25, -0.5], sampleRate: 48_000),
                Audio(start: 2 / 48_000, samples: [0.5], sampleRate: 24_000),
            ])
            try await track.close()
        }
    }
}
