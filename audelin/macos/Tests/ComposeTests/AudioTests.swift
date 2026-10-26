import FillIn
import Testing
@testable import Compose
@testable import TrackFile

@Suite(.timeLimit(.minutes(1)))
struct AudioTests {

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
