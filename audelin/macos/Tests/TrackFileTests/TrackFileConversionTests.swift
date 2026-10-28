import Foundation
import Testing
@testable import TrackFile

@Suite(.timeLimit(.minutes(1)))
struct TrackFileConversionTests {

    @Test func conversionFailureKeepsAcknowledgedAudioAndEndsWaitingReads() async throws {

        try await withTrackFolder { folder in
            let url = folder.appendingPathComponent("track.caf")
            let signal = AsyncStream<Void>.makeStream()
            let conversion = FailingConversion()
            let track = try TrackFile(
                url: url, makeBinding: DiskTrackBinding.init,
                makeConversion: { rate in
                    #expect(rate == 24_000)
                    return conversion
                }, readWaiting: { signal.continuation.yield(()) }
            )
            try await track.write([0.25], sampleRate: 24_000)
            let read = Task { try await track.read(from: 0.5, to: 2) }
            try await withTaskCancellationHandler {
                do {
                    var iterator = signal.stream.makeAsyncIterator()
                    guard await iterator.next() != nil else { throw CancellationError() }
                    await #expect(throws: ConversionFailure.self) { try await track.write([0.5], sampleRate: 24_000) }
                    expectSamples(try await read.value, Array(tone(1).suffix(24_000)))
                    await #expect(throws: TrackFile.Failure.writingEnded) {
                        try await track.write([0], sampleRate: 24_000)
                    }
                    try await track.close()
                    try await expectPlayable(url, tones: 1)
                } catch {
                    read.cancel()
                    _ = await read.result
                    throw error
                }
            } onCancel: { read.cancel() }
        }
    }

    @Test(arguments: [24_000.0, 44_100, 96_000, 44_100.5])
    func successiveVariableChunksKeepDurationAndContinuousAudio(rate: Double) async throws {

        try await withTrackFolder { folder in
            let url = folder.appendingPathComponent("track.caf")
            let track = try TrackFile(url: url)
            let input = (0..<Int((rate * 3).rounded())).map { Float(0.6 * sin(2 * .pi * 300 * Double($0) / rate)) }
            let sizes = [1, 31, 997, 4_096, 7, 8_191]
            var position = 0
            var chunk = 0
            var duration = 0.0
            var expected: [Float] = []
            var acknowledged = Data()
            while position < input.count {
                let end = min(input.count, position + sizes[chunk % sizes.count])
                let samples = Array(input[position..<end])
                duration += Double(samples.count) / rate
                let last = Int((duration * 48_000).rounded())
                expected += try referenceWrite(
                    samples, preceding: Array(input[..<position]), rate: rate, frames: expected.count..<last
                )
                try await track.write(samples, sampleRate: rate)
                let disk = try externalSamples(url)
                try #require(disk.count == last)
                let written = try await track.read(from: 0, to: duration)
                expectSamples(written, expected)
                let bytes = try Data(contentsOf: url).dropFirst(68)
                #expect(bytes.starts(with: acknowledged))
                acknowledged = Data(bytes)
                expectSamples(disk, expected)
                position = end
                chunk += 1
            }
            try await track.close()
            expectSamples(try await track.read(from: 0, to: duration), expected)
            expectSamples(try externalSamples(url), expected)
            try await expectAfinfo(url, frames: expected.count)
        }
    }

    @Test(arguments: [24_000, 44_100])
    func laterFailedWriteKeepsTheWholeConvertedSecond(rate: Int) async throws {

        try await withTrackFolder { folder in
            let url = folder.appendingPathComponent("track.caf")
            let binding = try FailingBinding(url: url)
            let rig = try TrackRig(folder, binding: binding)
            let expected = try referenceWrite(tone(1, rate: rate), preceding: [], rate: Double(rate))
            try await rig.track.write(tone(1, rate: rate), sampleRate: Double(rate))
            expectSamples(try await rig.track.read(from: 0, to: 1), expected)
            try await withPendingRead(rig, from: 0.5, to: 2) { read in
                binding.fail(.write)
                await #expect(throws: BindingFailure.self) {
                    try await rig.track.write(tone(2, rate: rate), sampleRate: Double(rate))
                }
                let tail = try await read.value
                expectSamples(tail, Array(expected.suffix(24_000)))
            }
            try await rig.track.close()
            expectSamples(try await rig.track.read(from: 0, to: 1), expected)
            expectSamples(try externalSamples(url), expected)
            try await expectAfinfo(url, frames: expected.count)
        }
    }
}

private struct ConversionFailure: Error {}

private final class FailingConversion: TrackFileConversion {

    private var written = false

    func convert(_ samples: [Float], frames: Int) throws -> [Float] {

        if written { throw ConversionFailure() }
        written = true
        return tone(1)
    }
}
