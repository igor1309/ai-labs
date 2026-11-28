import Foundation
import Testing
import TrackFile

/// Contract test: finished CAF files, read by the system's audio decoder.
@Suite(.timeLimit(.minutes(1)))
struct TrackFileSplitTests {
    @Test func copiesTheOriginalPCMForBothPartsInBoundedChunks() async throws {
        try await withTrackFolder { folder in
            let source = folder.appendingPathComponent("full.caf")
            let before = folder.appendingPathComponent("before.caf"), after = folder.appendingPathComponent("after.caf")
            let samples = (0..<100_001).map { Float($0 % 65_536 - 32_768) / 32_768 }
            let track = try await TrackFile(url: source)
            try await track.write(samples, sampleRate: 48_000)
            try await track.close()

            let boundary = 50_003
            try TrackFile.split(at: Double(boundary) / 48_000, source: source, before: before, after: after)

            #expect(try await externalSamples(before) == Array(samples[..<boundary]))
            #expect(try await externalSamples(after) == Array(samples[boundary...]))
            #expect(try await dataChunkLength(before) == Int64(boundary * 2 + 4))
            #expect(try await dataChunkLength(after) == Int64((samples.count - boundary) * 2 + 4))
            let pcm = try Data(contentsOf: source).suffix(samples.count * 2)
            #expect(try Data(contentsOf: before).suffix(boundary * 2) == pcm.prefix(boundary * 2))
            #expect(try Data(contentsOf: after).suffix((samples.count - boundary) * 2) == pcm.dropFirst(boundary * 2))
        }
    }

    @Test(arguments: [0, 1.25, 3, 5])
    func writesOnlyTheAvailableSamples(_ cutFrame: Double) async throws {
        try await withTrackFolder { folder in
            let source = folder.appendingPathComponent("short.caf")
            let before = folder.appendingPathComponent("before.caf"), after = folder.appendingPathComponent("after.caf")
            let samples: [Float] = [-0.75, 0.125, 0.5]
            let track = try await TrackFile(url: source)
            try await track.write(samples, sampleRate: 48_000)
            try await track.close()

            try TrackFile.split(at: cutFrame / 48_000, source: source, before: before, after: after)

            let boundary = min(Int(cutFrame.rounded(.up)), samples.count)
            if boundary == 0 { #expect(!FileManager.default.fileExists(atPath: before.path)) }
            else { #expect(try await externalSamples(before) == Array(samples[..<boundary])) }
            if boundary == samples.count { #expect(!FileManager.default.fileExists(atPath: after.path)) }
            else { #expect(try await externalSamples(after) == Array(samples[boundary...])) }
        }
    }

    @Test func missingTrackStaysAbsentAndMalformedTrackFails() async throws {
        try await withTrackFolder { folder in
            let source = folder.appendingPathComponent("source.caf")
            let before = folder.appendingPathComponent("before.caf"), after = folder.appendingPathComponent("after.caf")
            try TrackFile.split(at: 1, source: source, before: before, after: after)
            #expect(try FileManager.default.contentsOfDirectory(atPath: folder.path).isEmpty)

            let malformed = Data("not a CAF".utf8)
            try malformed.write(to: source)
            #expect(throws: TrackFile.Failure.invalidFile) {
                try TrackFile.split(at: 1, source: source, before: before, after: after)
            }
            #expect(try FileManager.default.contentsOfDirectory(atPath: folder.path) == [source.lastPathComponent])
            #expect(try Data(contentsOf: source) == malformed)
        }
    }

    @Test func removesTheFirstOutputWhenTheSecondCannotBeCreated() async throws {
        try await withTrackFolder { folder in
            let source = folder.appendingPathComponent("source.caf")
            let before = folder.appendingPathComponent("before.caf"), after = folder.appendingPathComponent("after.caf")
            let track = try await TrackFile(url: source)
            try await track.write([0.25, 0.5], sampleRate: 48_000)
            try await track.close()
            let occupied = Data("already there".utf8)
            try occupied.write(to: after)

            #expect(throws: POSIXError(.EEXIST)) {
                try TrackFile.split(at: 1 / 48_000, source: source, before: before, after: after)
            }
            #expect(!FileManager.default.fileExists(atPath: before.path))
            #expect(try Data(contentsOf: after) == occupied)
            #expect(try await externalSamples(source) == [0.25, 0.5])
        }
    }
}
