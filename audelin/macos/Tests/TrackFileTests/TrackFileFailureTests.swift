import Darwin
import Foundation
import Testing
@testable import TrackFile

@Suite(.timeLimit(.minutes(1)))
struct TrackFileFailureTests {

    @Test(arguments: [48_000, 24_000, 44_100], [31, 96_001])
    func sigkillKeepsEveryAcknowledgedTone(rate: Int, chunkSize: Int) async throws {

        try await withTrackFolder { folder in
            let url = folder.appendingPathComponent("track.caf")
            let executable = Bundle(for: TrackFileTestBundle.self).bundleURL
                .deletingLastPathComponent().appendingPathComponent("TrackFileCrashWriter")
            let command = try TrackCommand(executable.path, [url.path, String(rate), String(chunkSize)])
            do {
                try await withTaskCancellationHandler {
                    var text = ""
                    var reported: [Int] = []
                    for await bytes in command.output {
                        text += String(decoding: bytes, as: UTF8.self)
                        while let newline = text.firstIndex(of: "\n") {
                            let line = String(text[..<newline])
                            text.removeSubrange(...newline)
                            reported.append(try #require(Int(line), "unexpected helper output: \(line)"))
                        }
                        if reported.count >= 3 { break }
                    }
                    try Task.checkCancellation()
                    try #require(reported == [1, 2, 3])
                    command.kill()
                    #expect(await command.finish() == SIGKILL)
                    let samples = try externalSamples(url)
                    var preceding: [Float] = []
                    var expected: [Float] = []
                    var acknowledgedCount = 0
                    for number in 1...4 {
                        let input = tone(number, rate: rate, frames: chunkSize)
                        expected += rate == 48_000 ? input
                            : try referenceWrite(input, preceding: preceding, rate: Double(rate))
                        preceding += input
                        if number == reported.count { acknowledgedCount = expected.count }
                    }
                    try #require(samples.count >= acknowledgedCount)
                    try #require(samples.count <= expected.count)
                    expectSamples(samples, Array(expected.prefix(samples.count)))
                    #expect(try dataChunkLength(url) == -1)
                    try await expectAfinfo(url, frames: samples.count)
                } onCancel: {
                    command.kill()
                }
            } catch {
                await command.stop()
                throw error
            }
            await command.stop()
        }
    }

    @Test(.enabled(if: FileManager.default.isExecutableFile(atPath: "/usr/bin/hdiutil"),
                   "hdiutil is unavailable; the disk-full contract requires a mounted disk image"))
    func diskFullEndsWritingAndPreservesAcknowledgedTones() async throws {

        try await withTrackFolder { folder in
            try await withDiskImage(in: folder) { volume in
                let rig = try await TrackRig(volume)
                let url = volume.appendingPathComponent("track.caf")
                try await rig.track.write(tone(1), sampleRate: 48_000)
                try await withPendingRead(rig, from: 0.5, to: 1_000) { read in
                    var acknowledged = 1
                    var failure: (any Error)?
                    for number in 2...300 {
                        try Task.checkCancellation()
                        do { try await rig.track.write(tone(number), sampleRate: 48_000) }
                        catch { failure = error; break }
                        acknowledged = number
                    }
                    try #require(failure != nil, "the image must fill before the fixture ends")
                    let error = try #require(failure as? POSIXError)
                    #expect(error.code == .ENOSPC)
                    await #expect(throws: TrackFile.Failure.writingEnded) {
                        try await rig.track.write(tone(acknowledged + 1), sampleRate: 48_000)
                    }
                    let tail = try await read.value
                    #expect(tail.count == acknowledged * 48_000 - 24_000)
                    expectSamples(Array(tail.prefix(24_000)), Array(tone(1).suffix(24_000)))
                    for number in 2...acknowledged {
                        let start = (number - 1) * 48_000 - 24_000
                        expectSamples(Array(tail[start..<(start + 48_000)]), tone(number))
                    }
                    for number in 1...acknowledged {
                        expectSamples(
                            try await rig.track.read(from: Double(number - 1), to: Double(number)), tone(number)
                        )
                    }
                    try await expectPlayable(url, tones: acknowledged)
                }
            }
        }
    }
}

private final class TrackFileTestBundle: NSObject {}
