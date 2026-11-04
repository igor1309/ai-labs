import BlockingTestWork
import Foundation
import Testing
@testable import AudioConversion

struct ConverterTests {

    @Test func convertAvailableOnTinyChunksLosesNoAudioWhenOutputFillsTheResult() async throws {

        let samples = tone(frequency: 440, rate: 44_100, seconds: 0.25)

        let (drained, undrained, whole) = try await offPool {
            let tight = { try Converter(from: 44_100, to: 16_000, spareFrames: 0) }
            let single = try Converter(from: 44_100, to: 16_000)
            return (
                try chunked(samples, through: tight(), convert: { try $0.convertAvailable($1) }),
                try chunked(samples, through: tight(), convert: { try $0.convert($1) }),
                try single.convertAvailable(samples)
            )
        }

        #expect(drained == whole)
        #expect(undrained.count < whole.count, "The tight result must fill, or draining goes untested.")
    }

    @Test func flushReturnsTheFilterTailOnceAudioEnds() async throws {

        let samples = tone(frequency: 440, rate: 48_000, seconds: 0.25)

        let (converted, tail, secondTail) = try await offPool {
            let converter = try Converter(from: 48_000, to: 16_000)
            return (try converter.convertAvailable(samples), try converter.flush(), try converter.flush())
        }

        #expect(converted.count < 4_000)
        #expect(converted.count + tail.count == 4_000)
        #expect(tail.contains { abs($0) > 0.01 })
        #expect(secondTail.isEmpty)
    }

    @Test(arguments: [(44_100.0, 16_000.0), (48_000.0, 16_000.0), (16_000.0, 48_000.0), (8_000.0, 48_000.0)])
    func toneKeepsItsDurationAndFrequency(from input: Double, to output: Double) async throws {

        let samples = tone(frequency: 440, rate: input, seconds: 1)

        let converted = try await offPool {
            let converter = try Converter(from: input, to: output)
            return try converter.convertAvailable(samples) + converter.flush()
        }

        #expect(abs(Double(converted.count) - output) <= 2)
        #expect(abs(frequency(of: converted, rate: output) - 440) <= 2)
    }

    @Test func emptyChunkGivesNothing() async throws {

        let (converted, available) = try await offPool {
            let converter = try Converter(from: 48_000, to: 16_000)
            return (try converter.convert([]), try converter.convertAvailable([]))
        }

        #expect(converted.isEmpty)
        #expect(available.isEmpty)
    }

    @Test(arguments: [
        (0.0, 16_000.0), (16_000.0, 0.0),
        (-1.0, 16_000.0), (16_000.0, -1.0),
        (Double.nan, 16_000.0), (16_000.0, Double.nan),
        (Double.infinity, 16_000.0), (16_000.0, Double.infinity),
    ])
    func invalidRateFails(from input: Double, to output: Double) async {

        await #expect(throws: Converter.ConversionFailed.self) {
            try await offPool { _ = try Converter(from: input, to: output) }
        }
    }
}

private func chunked(
    _ samples: [Float],
    through converter: Converter,
    convert: (Converter, [Float]) throws -> [Float]
) throws -> [Float] {

    try stride(from: 0, to: samples.count, by: 5).reduce(into: [Float]()) { output, start in
        output += try convert(converter, Array(samples[start..<min(start + 5, samples.count)]))
    }
}

private func tone(frequency: Double, rate: Double, seconds: Double) -> [Float] {

    (0..<Int(rate * seconds)).map { Float(sin(2 * .pi * frequency * Double($0) / rate)) }
}

/// Counts rising zero crossings away from both ends, where the filter settles.
private func frequency(of samples: [Float], rate: Double) -> Double {

    let middle = samples[(samples.count / 4)..<(samples.count * 3 / 4)]
    let rises = zip(middle, middle.dropFirst()).filter { $0 < 0 && $1 >= 0 }.count
    return Double(rises) * rate / Double(middle.count)
}
