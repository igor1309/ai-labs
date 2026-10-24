import Darwin
import Foundation
import Synchronization
import Testing
@testable import TrackFile

@Suite(.timeLimit(.minutes(1)))
struct TrackFilePositionedWriteTests {

    @Test(arguments: [0, 1, 127, Int.max])
    func partialConvertedReplacementRestoresAcknowledgedAudio(prefix: Int) async throws {

        try await withTrackFolder { folder in
            let url = folder.appendingPathComponent("track.caf")
            let fault = PositionedWriteFault()
            let binding = try DiskTrackBinding(url: url, positionedWrite: { try fault.write($0, $1, $2) })
            let rig = try TrackRig(folder, binding: binding)
            try await rig.track.write(tone(1, rate: 24_000), sampleRate: 24_000)
            let acknowledged = try Data(contentsOf: url)
            fault.arm(after: prefix)
            await #expect(throws: BindingFailure.self) {
                try await rig.track.write(tone(2, rate: 24_000), sampleRate: 24_000)
            }
            #expect(try Data(contentsOf: url) == acknowledged)
            try await rig.track.close()
            expectConvertedTone(try await rig.track.read(from: 0, to: 1), number: 1)
            try await expectPlayable(url, tones: 1, converted: true)
        }
    }
}

final class PositionedWriteFault: Sendable {

    private let prefix = Mutex<Int?>(nil)

    func arm(after bytes: Int) { prefix.withLock { $0 = bytes } }

    func write(_ descriptor: Int32, _ bytes: UnsafeRawBufferPointer, _ offset: Int64) throws -> Int {

        let failure = prefix.withLock { value in
            let saved = value
            value = nil
            return saved
        }
        let count = min(bytes.count, failure ?? bytes.count)
        let written = pwrite(descriptor, bytes.baseAddress, count, offset)
        guard written >= 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        if failure != nil { throw BindingFailure() }
        return written
    }
}
