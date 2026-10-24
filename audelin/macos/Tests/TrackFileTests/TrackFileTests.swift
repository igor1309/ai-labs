import Foundation
import Testing
@testable import TrackFile

@Suite(.timeLimit(.minutes(1)))
struct TrackFileTests {

    @Test func numberedTonesReadBackByTrackTime() async throws {

        try await withTrackFolder { folder in
            let url = folder.appendingPathComponent("track.caf")
            let track = try TrackFile(url: url)
            for number in 1...3 { try await track.write(tone(number), sampleRate: 48_000) }
            for number in 1...3 {
                let samples = try await track.read(from: Double(number - 1), to: Double(number))
                expectSamples(samples, tone(number))
            }
            try await track.close()
            try await expectPlayable(url, tones: 3)
        }
    }

    @Test func unwrittenStretchWaitsForItsTone() async throws {

        try await withTrackFolder { folder in
            let rig = try TrackRig(folder)
            try await rig.track.write(tone(1), sampleRate: 48_000)
            try await withPendingRead(rig, from: 1, to: 2) { read in
                try await rig.track.write(tone(2), sampleRate: 48_000)
                expectSamples(try await read.value, tone(2))
            }
            try await rig.track.close()
            try await expectPlayable(folder.appendingPathComponent("track.caf"), tones: 2)
        }
    }

    @Test func cancelledReadEndsWithoutAudioAndDoesNotConsumeTheStretch() async throws {

        try await withTrackFolder { folder in
            let rig = try TrackRig(folder)
            try await withPendingRead(rig, from: 0, to: 1) { read in
                read.cancel()
                await #expect(throws: CancellationError.self) { try await read.value }
            }
            try await rig.track.write(tone(1), sampleRate: 48_000)
            expectSamples(try await rig.track.read(from: 0, to: 1), tone(1))
            try await rig.track.close()
            try await expectPlayable(folder.appendingPathComponent("track.caf"), tones: 1)
        }
    }

    @Test func otherRatesKeepDurationAndFrequency() async throws {

        try await withTrackFolder { folder in
            let url = folder.appendingPathComponent("track.caf")
            let track = try TrackFile(url: url)
            try await track.write(tone(1, rate: 24_000), sampleRate: 24_000)
            try await track.write(tone(2, rate: 44_100), sampleRate: 44_100)
            try await track.close()
            let expected = try referenceWrite(tone(1, rate: 24_000), preceding: [], rate: 24_000)
                + referenceWrite(tone(2, rate: 44_100), preceding: [], rate: 44_100)
            expectSamples(try await track.read(from: 0, to: 2), expected)
            expectSamples(try externalSamples(url), expected)
            try await expectAfinfo(url, frames: expected.count)
        }
    }

    @Test func closedFilePlaysEveryToneInOrder() async throws {

        try await withTrackFolder { folder in
            let url = folder.appendingPathComponent("track.caf")
            let track = try TrackFile(url: url)
            for number in 1...3 { try await track.write(tone(number), sampleRate: 48_000) }
            try await track.close()
            try await expectPlayable(url, tones: 3)
            #expect(try dataChunkLength(url) == 4 + 3 * 48_000 * 2)
            await #expect(throws: TrackFile.Failure.writingEnded) {
                try await track.write(tone(4), sampleRate: 48_000)
            }
        }
    }

    @Test func closingReleasesWaitingReadWithOnlyTheWrittenTail() async throws {

        try await withTrackFolder { folder in
            let rig = try TrackRig(folder)
            try await rig.track.write(tone(1), sampleRate: 48_000)
            try await withPendingRead(rig, from: 0.5, to: 2) { read in
                try await rig.track.close()
                expectSamples(try await read.value, Array(tone(1).suffix(24_000)))
            }
            expectSamples(try await rig.track.read(from: 0.5, to: 2), Array(tone(1).suffix(24_000)))
            #expect(try await rig.track.read(from: 3, to: 4).isEmpty)
            try await expectPlayable(folder.appendingPathComponent("track.caf"), tones: 1)
        }
    }

    @Test func missingAndUnwritableFoldersLeaveNoFile() async throws {

        try await withTrackFolder { folder in
            let missing = folder.appendingPathComponent("missing/track.caf")
            #expect(throws: (any Error).self) { try TrackFile(url: missing) }
            #expect(!FileManager.default.fileExists(atPath: missing.path))
            let locked = folder.appendingPathComponent("locked", isDirectory: true)
            try FileManager.default.createDirectory(at: locked, withIntermediateDirectories: false)
            try FileManager.default.setAttributes([.posixPermissions: 0o555], ofItemAtPath: locked.path)
            defer { try? FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: locked.path) }
            let url = locked.appendingPathComponent("track.caf")
            #expect(throws: (any Error).self) { try TrackFile(url: url) }
            #expect(!FileManager.default.fileExists(atPath: url.path))
        }
    }

    @Test func headerFailureRemovesOnlyItsCreationAndAllowsRetry() async throws {

        try await withTrackFolder { folder in
            let url = folder.appendingPathComponent("track.caf")
            let binding = try FailingBinding(url: url)
            binding.fail(.header)
            #expect(throws: BindingFailure.self) {
                try TrackFile(
                    url: url, makeBinding: { _ in binding },
                    makeConversion: { try CompleteConversion(inputRate: $0) }
                )
            }
            #expect(!FileManager.default.fileExists(atPath: url.path))
            let track = try TrackFile(url: url)
            try await track.write(tone(1), sampleRate: 48_000)
            try await track.close()
            try await expectPlayable(url, tones: 1)
        }
    }

    @Test func existingFileAndSymlinkAreNeverOverwritten() async throws {

        try await withTrackFolder { folder in
            let url = folder.appendingPathComponent("kept.caf")
            let bytes = Data("a kept recording".utf8)
            try bytes.write(to: url)
            let link = folder.appendingPathComponent("link.caf")
            try FileManager.default.createSymbolicLink(at: link, withDestinationURL: url)
            for path in [url, link] {
                #expect(throws: (any Error).self) { try TrackFile(url: path) }
                #expect(try Data(contentsOf: url) == bytes)
            }
        }
    }

    @Test func readFailureIsReportedAndCanBeRetried() async throws {

        try await withTrackFolder { folder in
            let url = folder.appendingPathComponent("track.caf")
            let binding = try FailingBinding(url: url)
            let track = try TrackFile(
                url: url, makeBinding: { _ in binding },
                makeConversion: { try CompleteConversion(inputRate: $0) }
            )
            try await track.write(tone(1), sampleRate: 48_000)
            binding.fail(.read)
            await #expect(throws: BindingFailure.self) { try await track.read(from: 0, to: 1) }
            binding.fail(nil)
            expectSamples(try await track.read(from: 0, to: 1), tone(1))
            try await track.close()
        }
    }

    @Test(arguments: 0...8)
    func failedFinalLengthLeavesOpenFilePlayableAndEndsWaitingReads(prefix: Int) async throws {

        try await withTrackFolder { folder in
            let url = folder.appendingPathComponent("track.caf")
            let fault = PositionedWriteFault()
            let binding = try DiskTrackBinding(url: url, positionedWrite: { try fault.write($0, $1, $2) })
            let rig = try TrackRig(folder, binding: binding)
            for number in 1...3 { try await rig.track.write(tone(number), sampleRate: 48_000) }
            try await withPendingRead(rig, from: 2, to: 4) { read in
                fault.arm(after: prefix)
                await #expect(throws: BindingFailure.self) { try await rig.track.close() }
                expectSamples(try await read.value, tone(3))
            }
            await #expect(throws: TrackFile.Failure.writingEnded) {
                try await rig.track.write(tone(4), sampleRate: 48_000)
            }
            #expect(try dataChunkLength(url) == -1)
            try await expectPlayable(url, tones: 3)
        }
    }

    @Test func invalidRangesFailWithoutTrapping() async throws {

        try await withTrackFolder { folder in
            let track = try TrackFile(url: folder.appendingPathComponent("track.caf"))
            for (start, end) in [(-1.0, 1.0), (2, 1), (0, .infinity), (.nan, 1), (0, 1e30)] {
                await #expect(throws: TrackFile.Failure.invalidRange) { try await track.read(from: start, to: end) }
            }
            #expect(try await track.read(from: 10, to: 10).isEmpty)
            try await track.write(tone(1), sampleRate: 48_000)
            expectSamples(try await track.read(from: 0, to: 1), tone(1))
            try await track.close()
        }
    }

    @Test func invalidAudioEndsWritingWithoutTrapping() async throws {

        try await withTrackFolder { folder in
            let inputs: [([Float], Double)] = [
                ([0], 0), ([0], -1), ([0], .infinity), ([0], .nan),
                ([.nan], 48_000), ([.infinity], 48_000), ([-.infinity], 48_000),
            ]
            for (index, input) in inputs.enumerated() {
                let track = try TrackFile(url: folder.appendingPathComponent("invalid-\(index).caf"))
                await #expect(throws: TrackFile.Failure.invalidAudio) {
                    try await track.write(input.0, sampleRate: input.1)
                }
                await #expect(throws: TrackFile.Failure.writingEnded) {
                    try await track.write([0], sampleRate: 48_000)
                }
                #expect(try await track.read(from: 0, to: 1).isEmpty)
                try await track.close()
            }
        }
    }
}
