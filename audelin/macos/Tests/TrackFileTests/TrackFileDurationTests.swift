import BlockingTestWork
import Foundation
import Testing
import TrackFile

@Suite(.timeLimit(.minutes(1)))
struct TrackFileDurationTests {

    @Test(arguments: [0, 1, 31, 48_000, 96_001])
    func durationCountsWrittenFramesBeforeAndAfterClose(frames: Int) async throws {
        try await withDurationFolder { folder in
            let url = folder.appendingPathComponent("track.caf")
            let track = try await TrackFile(url: url)
            try await track.write(Array(repeating: 0, count: frames), sampleRate: 48_000)
            #expect(try await offPool { try TrackFile.duration(at: url) } == Double(frames) / 48_000)
            try await track.close()
            #expect(try await offPool { try TrackFile.duration(at: url) } == Double(frames) / 48_000)
        }
    }

    @Test(arguments: Array(0..<68))
    func incompleteHeaderIsRejected(length: Int) async throws {
        try await withDurationFolder { folder in
            let valid = try await sealedHeader(in: folder)
            let url = folder.appendingPathComponent("truncated.caf")
            try await offPool { try valid.prefix(length).write(to: url) }
            await #expect(throws: TrackFile.Failure.invalidFile) {
                try await offPool { try TrackFile.duration(at: url) }
            }
        }
    }

    @Test(arguments: Array(0..<56) + Array(64..<68))
    func differentFormatIsRejected(offset: Int) async throws {
        try await withDurationFolder { folder in
            var header = try await sealedHeader(in: folder)
            header[offset] ^= 1
            let bytes = header
            let url = folder.appendingPathComponent("invalid.caf")
            try await offPool { try bytes.write(to: url) }
            await #expect(throws: TrackFile.Failure.invalidFile) {
                try await offPool { try TrackFile.duration(at: url) }
            }
        }
    }

    @Test(arguments: [UInt64(0), 1, 3, 5, 6, 7, 9, 10, UInt64.max - 1])
    func invalidOrTruncatedDataLengthIsRejected(length: UInt64) async throws {
        try await withDurationFolder { folder in
            var bytes = try await sealedHeader(in: folder)
            bytes.replaceSubrange(56..<64, with: bigEndianBytes(length))
            bytes.append(contentsOf: [0, 0, 0, 0])
            let contents = bytes
            let url = folder.appendingPathComponent("invalid.caf")
            try await offPool { try contents.write(to: url) }
            await #expect(throws: TrackFile.Failure.invalidFile) {
                try await offPool { try TrackFile.duration(at: url) }
            }
        }
    }

    @Test func sealedPartialFrameIsRejected() async throws {
        try await withDurationFolder { folder in
            var bytes = try await sealedHeader(in: folder)
            bytes.replaceSubrange(56..<64, with: bigEndianBytes(UInt64(5)))
            bytes.append(0)
            let contents = bytes
            let url = folder.appendingPathComponent("partial.caf")
            try await offPool { try contents.write(to: url) }
            await #expect(throws: TrackFile.Failure.invalidFile) {
                try await offPool { try TrackFile.duration(at: url) }
            }
        }
    }

    @Test func missingUnreadableAndNonFileInputsThrow() async throws {
        try await withDurationFolder { folder in
            let url = folder.appendingPathComponent("track.caf")
            await #expect(throws: (any Error).self) {
                try await offPool { try TrackFile.duration(at: url) }
            }
            let track = try await TrackFile(url: url)
            try await track.close()
            try await offPool { try FileManager.default.setAttributes([.posixPermissions: 0], ofItemAtPath: url.path) }
            try await withCleanup {
                await #expect(throws: (any Error).self) {
                    try await offPool { try TrackFile.duration(at: url) }
                }
                return ()
            } cleanup: {
                try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
            }
            for invalid in [folder, URL(string: "https://example.com/track.caf")!] {
                await #expect(throws: (any Error).self) {
                    try await offPool { try TrackFile.duration(at: invalid) }
                }
            }
        }
    }

    @Test func largeRecordingNeedsOnlyItsHeader() async throws {
        try await withDurationFolder { folder in
            var header = try await sealedHeader(in: folder)
            let audioBytes = UInt64(8) * 1_024 * 1_024 * 1_024
            header.replaceSubrange(56..<64, with: bigEndianBytes(audioBytes + 4))
            let contents = header
            let url = folder.appendingPathComponent("large.caf")
            try await offPool {
                try contents.write(to: url)
                let file = try FileHandle(forWritingTo: url)
                defer { try? file.close() }
                try file.truncate(atOffset: 68 + audioBytes)
            }
            #expect(try await offPool { try TrackFile.duration(at: url) } == Double(audioBytes / 2) / 48_000)
        }
    }
}

private func sealedHeader(in folder: URL) async throws -> Data {
    let url = folder.appendingPathComponent("empty.caf")
    let track = try await TrackFile(url: url)
    try await track.close()
    return try await offPool { try Data(contentsOf: url) }
}

private func bigEndianBytes(_ value: UInt64) -> [UInt8] {
    withUnsafeBytes(of: value.bigEndian) { Array($0) }
}

private func withDurationFolder(_ body: (URL) async throws -> Void) async throws {
    let folder = await offPool { FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true) }
    try await offPool { try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false) }
    try await withCleanup { try await body(folder) } cleanup: {
        try FileManager.default.removeItem(at: folder)
    }
}
