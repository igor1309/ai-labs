import Foundation
import Synchronization
import Testing
import TrackFile

/// Contract test: saved CAF files, including unsealed recordings, through TrackFile's reader.
@Suite(.timeLimit(.minutes(1)))
struct TrackFileSavedReadTests {
    @Test(arguments: [false, true])
    func readsWholeFramesInBoundedChunks(sealed: Bool) async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let url = folder.appendingPathComponent("track.caf")
        let samples = (0..<96_031).map { Float($0 % 1024 - 512) / 32768 }
        let track = try await TrackFile(url: url)
        try await track.write(samples, sampleRate: 48_000)
        if sealed { try await track.close() }
        let chunks = Mutex<[TrackFile.SavedChunk]>([])
        try await TrackFile.readSaved(at: url) { chunk in chunks.withLock { $0.append(chunk) } }
        let read = chunks.withLock { $0 }
        #expect(read.flatMap(\.samples) == samples)
        #expect(read.map(\.start) == [0, 1, 2])
        #expect(read.map { $0.samples.count } == [48_000, 48_000, 31])
        #expect(read.map(\.fraction) == [48_000.0 / 96_031, 96_000.0 / 96_031, 1])
        try await track.close()
    }

    @Test func invalidSavedFileIsRejectedBeforeDeliveringSamples() async throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".caf")
        defer { try? FileManager.default.removeItem(at: url) }
        try Data("invalid CAF".utf8).write(to: url)
        await #expect(throws: TrackFile.Failure.invalidFile) {
            try await TrackFile.readSaved(at: url) { _ in Issue.record("Invalid track delivered audio") }
        }
    }

    @Test func cancellationStopsBeforeTheNextChunk() async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let url = folder.appendingPathComponent("track.caf")
        let track = try await TrackFile(url: url)
        try await track.write(Array(repeating: 0.25, count: 96_000), sampleRate: 48_000)
        try await track.close()
        let delivered = AsyncStream<Void>.makeStream(), hold = AsyncStream<Void>.makeStream()
        let count = Mutex(0)
        let reading = Task {
            try await TrackFile.readSaved(at: url) { _ in
                count.withLock { $0 += 1 }
                delivered.continuation.yield(())
                for await _ in hold.stream {}
            }
        }
        var first = delivered.stream.makeAsyncIterator()
        _ = await first.next()
        reading.cancel()
        hold.continuation.finish()
        do { try await reading.value; Issue.record("Cancelled read succeeded") }
        catch { #expect(error is CancellationError) }
        #expect(count.withLock { $0 } == 1)
        delivered.continuation.finish()
    }
}
