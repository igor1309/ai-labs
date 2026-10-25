import CallText
import struct MicrophoneCapture.AudioPiece
import struct SystemAudioCapture.AudioPiece
import Testing
@testable import Compose
@testable import TrackFile

@Suite(.timeLimit(.minutes(1)))
struct AudioTests {

    @Test func captureRatesTranslateWithoutChangingSamplesOrCallTime() async throws {

        try await withComposeFolder { folder in
            let track = try TrackFile(url: folder.appendingPathComponent("track.caf"))
            typealias Piece = (samples: [Float], sampleRate: Double)
            let source = AsyncThrowingStream<Piece, any Error>.makeStream()
            let feed = CaptureFeed(stream: source.stream, track: track, unpack: { $0 })
            defer { source.continuation.finish(); feed.cancel() }
            let pieces: [Piece] = [
                (Array(repeating: 0, count: 48), 48_000),
                (Array(repeating: 0, count: 24), 24_000),
                (Array(repeating: 0, count: 96), 96_000),
            ]
            for piece in pieces { source.continuation.yield(piece) }
            source.continuation.finish()
            try await feed.wait()
            let received = Values<Audio>()
            await feed.listen { received.append($0) }
            #expect(received.all == pieces.enumerated().map { index, piece in
                Audio(start: Double(index) / 1_000, samples: piece.samples, sampleRate: piece.sampleRate)
            })
            #expect(feed.capturedThrough == 0.003)
            try await track.close()
            #expect(try await track.read(from: 0, to: 0.003) == Array(repeating: Float(0), count: 144))
        }
    }

    @Test(arguments: [false, true])
    func bothCapturesWriteBeforeDeliveryAndKeepCallTime(system: Bool) async throws {

        try await withComposeFolder { folder in
            let track = try TrackFile(url: folder.appendingPathComponent("track.caf"))
            let expected = [
                Audio(start: 0, samples: [0.25, -0.5], sampleRate: 48_000),
                Audio(start: 2 / 48_000, samples: [0.5, 0.125, -0.25], sampleRate: 48_000),
            ]
            let feed: CaptureFeed
            if system {
                let source = AsyncThrowingStream<SystemAudioCapture.AudioPiece, any Error>.makeStream()
                feed = CaptureFeed(stream: source.stream, track: track)
                for audio in expected { source.continuation.yield(.init(samples: audio.samples, sampleRate: audio.sampleRate)) }
                source.continuation.finish()
            } else {
                let source = AsyncThrowingStream<MicrophoneCapture.AudioPiece, any Error>.makeStream()
                feed = CaptureFeed(stream: source.stream, track: track)
                for audio in expected { source.continuation.yield(.init(samples: audio.samples, sampleRate: audio.sampleRate)) }
                source.continuation.finish()
            }
            defer { feed.cancel() }
            let received = Values<Audio>()
            let began = Signal()
            let release = Signal()
            let listener = Task {
                await feed.listen { audio in
                    if audio.start == 0 {
                        began.send()
                        await release.next()
                    }
                    let written = try? await track.read(from: audio.start, to: audio.end)
                    #expect(written == audio.samples)
                    received.append(audio)
                }
            }
            defer { listener.cancel(); release.end() }
            await began.next()
            try await feed.wait()
            #expect(feed.capturedThrough == expected.last?.end)
            #expect(received.all.isEmpty)
            release.end()
            await listener.value
            #expect(received.all == expected)
            try await track.close()
            #expect(try await track.read(from: 0, to: 5 / 48_000) == expected.flatMap(\.samples))
        }
    }

    @Test func cancellingListenerLeavesWritingAndCaptureRunning() async throws {

        try await withComposeFolder { folder in
            let track = try TrackFile(url: folder.appendingPathComponent("track.caf"))
            let source = AsyncThrowingStream<MicrophoneCapture.AudioPiece, any Error>.makeStream()
            let feed = CaptureFeed(stream: source.stream, track: track)
            defer { source.continuation.finish(); feed.cancel() }
            let began = Signal()
            let hold = Signal()
            let received = Values<Audio>()
            let listener = Task {
                await feed.listen { audio in
                    received.append(audio)
                    began.send()
                    await hold.next()
                }
            }
            defer { listener.cancel(); hold.end() }
            source.continuation.yield(.init(samples: [0.25], sampleRate: 48_000))
            await began.next()
            listener.cancel()
            await listener.value
            source.continuation.yield(.init(samples: [0.5], sampleRate: 48_000))
            source.continuation.finish()
            try await feed.wait()
            #expect(received.all == [Audio(start: 0, samples: [0.25], sampleRate: 48_000)])
            #expect(feed.capturedThrough == 2 / 48_000.0)
            try await track.close()
            #expect(try await track.read(from: 0, to: 2 / 48_000) == [0.25, 0.5])
        }
    }

    @Test(arguments: [false, true])
    func failuresEndAfterTheWrittenPrefix(writeFails: Bool) async throws {

        try await withComposeFolder { folder in
            let track = try TrackFile(url: folder.appendingPathComponent("track.caf"))
            let source = AsyncThrowingStream<MicrophoneCapture.AudioPiece, any Error>.makeStream()
            let feed = CaptureFeed(stream: source.stream, track: track)
            defer { source.continuation.finish(); feed.cancel() }
            source.continuation.yield(.init(samples: [0.25], sampleRate: 48_000))
            if writeFails {
                source.continuation.yield(.init(samples: [.nan], sampleRate: 48_000))
                source.continuation.finish()
                await #expect(throws: TrackFile.Failure.invalidAudio) { try await feed.wait() }
            } else {
                source.continuation.finish(throwing: ScriptFailure.failed)
                await #expect(throws: ScriptFailure.failed) { try await feed.wait() }
            }
            let received = Values<Audio>()
            await feed.listen { received.append($0) }
            #expect(received.all == [Audio(start: 0, samples: [0.25], sampleRate: 48_000)])
            #expect(feed.capturedThrough == Double(writeFails ? 2 : 1) / 48_000)
            try await track.close()
            #expect(try await track.read(from: 0, to: 2 / 48_000) == [0.25])
        }
    }

    @Test func writeFailureEndsTheFeedWhileTheSourceStaysOpen() async throws {

        try await withComposeFolder { folder in
            let track = try TrackFile(url: folder.appendingPathComponent("track.caf"))
            let source = AsyncThrowingStream<MicrophoneCapture.AudioPiece, any Error>.makeStream()
            let feed = CaptureFeed(stream: source.stream, track: track)
            defer { source.continuation.finish(); feed.cancel() }
            let prefix = Audio(start: 0, samples: [0.25, -0.5], sampleRate: 48_000)
            source.continuation.yield(.init(samples: prefix.samples, sampleRate: prefix.sampleRate))
            source.continuation.yield(.init(samples: [.nan], sampleRate: 48_000))

            await #expect(throws: TrackFile.Failure.invalidAudio) { try await feed.wait() }
            let received = Values<Audio>()
            await feed.listen { received.append($0) }
            #expect(received.all == [prefix])
            try await track.close()
            #expect(try await track.read(from: 0, to: 3 / 48_000) == prefix.samples)
        }
    }

    @Test func capturedThroughIncludesAudioWhoseWriteIsHeld() async throws {

        try await withComposeFolder { folder in
            let track = try TrackFile(url: folder.appendingPathComponent("track.caf"))
            typealias Piece = (samples: [Float], sampleRate: Double)
            let source = AsyncThrowingStream<Piece, any Error>.makeStream()
            let held = Signal()
            let release = Signal()
            let feed = CaptureFeed(stream: source.stream, track: track, unpack: { $0 }, beforeWrite: { audio in
                if audio.start > 0 {
                    held.send()
                    await release.next()
                    try Task.checkCancellation()
                }
            })
            defer { source.continuation.finish(); feed.cancel(); release.end() }
            let expected = [
                Audio(start: 0, samples: [0.25, -0.5], sampleRate: 48_000),
                Audio(start: 2 / 48_000, samples: [0.5], sampleRate: 48_000),
            ]
            for audio in expected { source.continuation.yield((audio.samples, audio.sampleRate)) }

            await held.next()
            try Task.checkCancellation()
            #expect(feed.capturedThrough == expected.last?.end)
            #expect(try await track.read(from: 0, to: expected[0].end) == expected[0].samples)

            release.end()
            source.continuation.finish()
            try await feed.wait()
            let received = Values<Audio>()
            await feed.listen { received.append($0) }
            #expect(received.all == expected)
            try await track.close()
            #expect(try await track.read(from: 0, to: 3 / 48_000) == expected.flatMap(\.samples))
        }
    }

    @Test func validAudioRejectedByAClosedTrackIsNeverDelivered() async throws {

        try await withComposeFolder { folder in
            let track = try TrackFile(url: folder.appendingPathComponent("track.caf"))
            try await track.close()
            let source = AsyncThrowingStream<MicrophoneCapture.AudioPiece, any Error>.makeStream()
            let feed = CaptureFeed(stream: source.stream, track: track)
            defer { source.continuation.finish(); feed.cancel() }
            source.continuation.yield(.init(samples: [0.25, -0.5], sampleRate: 48_000))
            source.continuation.finish()
            await #expect(throws: TrackFile.Failure.writingEnded) { try await feed.wait() }
            let received = Values<Audio>()
            await feed.listen { received.append($0) }
            #expect(received.all.isEmpty)
            #expect(feed.capturedThrough == 2 / 48_000.0)
            #expect(try await track.read(from: 0, to: 2 / 48_000) == [])
        }
    }

    @Test func writtenTrackMapsIntervalsAndPartialEnds() async throws {

        try await withComposeFolder { folder in
            let track = try TrackFile(url: folder.appendingPathComponent("track.caf"))
            try await track.write([0.25, -0.5, 0.125, 0.5], sampleRate: 48_000)
            try await track.close()
            let adapter = Compose.WrittenTrack(track: track)
            let rate = 48_000.0
            let cases: [(Double, Double, [Float])] = [
                (0, 4 / rate, [0.25, -0.5, 0.125, 0.5]),
                (1 / rate, 3 / rate, [-0.5, 0.125]),
                (3 / rate, 8 / rate, [0.5]),
                (2 / rate, 2 / rate, []),
            ]
            for (start, end, samples) in cases {
                #expect(try await adapter.read(from: start, through: end) == [
                    Audio(start: start, samples: samples, sampleRate: 48_000),
                ])
            }
            await #expect(throws: TrackFile.Failure.invalidRange) {
                try await adapter.read(from: -1, through: 0)
            }
        }
    }

    @Test func cancellingAPendingWrittenReadEndsIt() async throws {

        try await withComposeFolder { folder in
            let began = Signal()
            let track = try TrackFile(
                url: folder.appendingPathComponent("track.caf"),
                makeBinding: DiskTrackBinding.init,
                makeConversion: { _ in throw ScriptFailure.failed },
                readWaiting: { began.send() }
            )
            let adapter = Compose.WrittenTrack(track: track)
            let read = Task { try await adapter.read(from: 0, through: 1) }
            defer { read.cancel() }
            await began.next()
            read.cancel()
            await #expect(throws: CancellationError.self) { try await read.value }
            try await track.close()
        }
    }
}
