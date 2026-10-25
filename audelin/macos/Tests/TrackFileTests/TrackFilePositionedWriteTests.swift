import Darwin
import Foundation
import Synchronization
import Testing
@testable import TrackFile

@Suite(.timeLimit(.minutes(1)))
struct TrackFilePositionedWriteTests {

    static let faults: [(persistent: Bool, prefix: Int)] = [false, true].flatMap { persistent in
        [0, 1, 127, Int.max].map { (persistent, $0) }
    }

    static let cases: [(rate: Int, chunkSize: Int, persistent: Bool, prefix: Int)] = [24_000, 44_100].flatMap { rate in
        [31, 96_001].flatMap { chunkSize in faults.map { (rate, chunkSize, $0.persistent, $0.prefix) } }
    }

    /// Each fault is its own case under the suite's time limit: run in one
    /// loop, the large chunk took 68 s on hosted CI (PR #1275).
    @Test(arguments: cases)
    func partialConvertedAppendKeepsAcknowledgedAudio(
        _ testCase: (rate: Int, chunkSize: Int, persistent: Bool, prefix: Int)
    ) async throws {

        let (rate, chunkSize, persistent, prefix) = testCase
        try await withTrackFolder { folder in
            let url = folder.appendingPathComponent("track.caf")
            let fault = PositionedWriteFault()
            let binding = try DiskTrackBinding(url: url, positionedWrite: { try fault.write($0, $1, $2) })
            let rig = try TrackRig(folder, binding: binding)
            var preceding: [Float] = []
            var expected: [Float] = []
            for number in 1...2 {
                let input = tone(number, rate: rate, frames: chunkSize)
                expected += try referenceWrite(input, preceding: preceding, rate: Double(rate))
                try await rig.track.write(input, sampleRate: Double(rate))
                expectSamples(try await rig.track.read(from: 0, to: Double(expected.count) / 48_000), expected)
                preceding += input
                fault.acknowledge(try Data(contentsOf: url).count)
            }
            let acknowledged = try Data(contentsOf: url)
            try await withPendingRead(rig, from: 0, to: 60) { read in
                fault.arm(after: prefix, persistent: persistent)
                await #expect(throws: BindingFailure.self) {
                    try await rig.track.write(tone(3, rate: rate, frames: chunkSize), sampleRate: Double(rate))
                }
                expectSamples(try await read.value, expected)
            }
            #expect(try Data(contentsOf: url) == acknowledged)
            expectSamples(try externalSamples(url), expected)
            await #expect(throws: TrackFile.Failure.writingEnded) {
                try await rig.track.write([0.5], sampleRate: Double(rate))
            }
            // The fault remains armed through all failed-write recovery.
            fault.disarm()
            try await rig.track.close()
            expectSamples(try await rig.track.read(from: 0, to: 60), expected)
            expectSamples(try externalSamples(url), expected)
            try await expectAfinfo(url, frames: expected.count)
        }
    }
}

final class PositionedWriteFault: Sendable {

    private let failure = Mutex<(prefix: Int, persistent: Bool)?>(nil)
    private let acknowledgedEnd = Mutex<Int64>(68)

    func acknowledge(_ bytes: Int) { acknowledgedEnd.withLock { $0 = Int64(bytes) } }

    func arm(after bytes: Int, persistent: Bool = false) {

        failure.withLock { $0 = (bytes, persistent) }
    }

    func disarm() { failure.withLock { $0 = nil } }

    func write(_ descriptor: Int32, _ bytes: UnsafeRawBufferPointer, _ offset: Int64) throws -> Int {

        if offset >= 68 { #expect(offset >= acknowledgedEnd.withLock { $0 }) }
        let prefix = failure.withLock { value in
            let saved = value
            if saved?.persistent == false { value = nil }
            return saved?.prefix
        }
        let count = min(bytes.count, prefix ?? bytes.count)
        let written = pwrite(descriptor, bytes.baseAddress, count, offset)
        guard written >= 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        if prefix != nil { throw BindingFailure() }
        return written
    }
}
