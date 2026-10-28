import Foundation
import Testing
@testable import TrackFile

@Suite(.timeLimit(.minutes(1)))
struct TrackFileRateChangeTests {

    @Test(arguments: [
        [(512, 44_100.0), (512, 48_000), (512, 44_100)],
        [(1, 96_000.0), (1, 48_000), (1, 96_000), (512, 44_100), (512, 48_000)],
        [(441, 22_050.0), (7, 96_000), (480, 44_100), (7, 22_050), (480, 88_200), (1, 44_100)]
            + Array(repeating: [(31, 44_100.5), (31, 44_100.5), (512, 48_000), (1, 96_000), (1, 96_000), (7, 24_000)], count: 4)
            .flatMap { $0 },
    ] as [[(Int, Double)]])
    func rateChangesKeepCallTimeAndReleaseCatchUp(pieces: [(Int, Double)]) async throws {

        try await withTrackFolder { folder in
            let rig = try TrackRig(folder)
            let url = rig.track.url
            var duration = 0.0
            var acknowledged: [Float] = []

            func writePiece(_ index: Int) async throws -> [Float] {

                let (count, rate) = pieces[index]
                let level = Float(index % 5 + 1) / 8
                duration += Double(count) / rate
                try await rig.track.write(Array(repeating: level, count: count), sampleRate: rate)
                let disk = try externalSamples(url)
                try #require(disk.count == Int((duration * 48_000).rounded()))
                expectSamples(Array(disk.prefix(acknowledged.count)), acknowledged)
                let appended = Array(disk.dropFirst(acknowledged.count))
                if rate == 48_000 {
                    expectSamples(appended, Array(repeating: level, count: appended.count))
                } else if appended.count > 256 {
                    let middle = Array(appended.dropFirst(128).dropLast(128))
                    expectSamples(middle, Array(repeating: level, count: middle.count))
                }
                acknowledged = disk
                return disk
            }

            for index in pieces.indices.dropLast() {
                let disk = try await writePiece(index)
                expectSamples(try await rig.track.read(from: 0, to: duration), disk)
            }
            let last = pieces.count - 1
            let end = duration + Double(pieces[last].0) / pieces[last].1
            try await withPendingRead(rig, from: 0, to: end) { read in
                let disk = try await writePiece(last)
                if pieces.count == 3 { #expect(disk.count == 1_627) }
                expectSamples(try await read.value, disk)
            }
            try await rig.track.close()
            #expect(try dataChunkLength(url) == 4 + Int64(acknowledged.count) * 2)
            expectSamples(try await rig.track.read(from: 0, to: end), acknowledged)
            expectSamples(try externalSamples(url), acknowledged)
        }
    }
}
