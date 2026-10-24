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
            let count = Int((Double(input.count) * 48_000 / rate).rounded())
            let expected = (0..<count).map { Float(0.6 * sin(2 * .pi * 300 * Double($0) / 48_000)) }
            let sizes = [1, 31, 997, 4_096, 7, 8_191]
            var position = 0
            var chunk = 0
            while position < input.count {
                let end = min(input.count, position + sizes[chunk % sizes.count])
                try await track.write(Array(input[position..<end]), sampleRate: rate)
                position = end
                chunk += 1
                // Read before close: every returned write already has its full duration.
                let frames = Int((Double(end) * 48_000 / rate).rounded())
                let written = try await track.read(from: 0, to: Double(frames) / 48_000)
                #expect(written.count == frames)
            }
            try await track.close()
            let actual = try await track.read(from: 0, to: Double(count) / 48_000)
            expectContinuousTone(actual, expected)
            expectContinuousTone(try externalSamples(url), expected)
            try await expectAfinfo(url, frames: expected.count)
        }
    }

    @Test(arguments: [24_000, 44_100])
    func laterFailedWriteKeepsTheWholeConvertedSecond(rate: Int) async throws {

        try await withTrackFolder { folder in
            let url = folder.appendingPathComponent("track.caf")
            let binding = try FailingBinding(url: url)
            let rig = try TrackRig(folder, binding: binding)
            try await rig.track.write(tone(1, rate: rate), sampleRate: Double(rate))
            try await withPendingRead(rig, from: 0.5, to: 2) { read in
                binding.fail(.write)
                await #expect(throws: BindingFailure.self) {
                    try await rig.track.write(tone(2, rate: rate), sampleRate: Double(rate))
                }
                let tail = try await read.value
                #expect(tail.count == 24_000)
            }
            try await rig.track.close()
            expectConvertedTone(try await rig.track.read(from: 0, to: 1), number: 1)
            try await expectPlayable(url, tones: 1, converted: true)
        }
    }
}

func expectContinuousTone(_ actual: [Float], _ expected: [Float], sourceLocation: SourceLocation = #_sourceLocation) {

    #expect(actual.count == expected.count, sourceLocation: sourceLocation)
    let errors = zip(actual.dropFirst(256).dropLast(256), expected.dropFirst(256).dropLast(256))
        .map { abs($0 - $1) }
    let error = errors.max() ?? 0
    #expect(error < 0.005, "continuous tone error: \(error), frame: \(256 + (errors.firstIndex(of: error) ?? 0))", sourceLocation: sourceLocation)
}

private struct ConversionFailure: Error {}

private final class FailingConversion: TrackFileConversion {

    private var written = false

    func convert(_ samples: [Float]) throws -> ConvertedAudio {

        if written { throw ConversionFailure() }
        written = true
        return ConvertedAudio(samples: tone(1), replacing: 0)
    }
}
