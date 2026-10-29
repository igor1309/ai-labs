import Dispatch
import Foundation
import Testing
@testable import TrackFile

@Suite(.timeLimit(.minutes(1)))
struct TrackFileExecutorTests {

    @Test func isolatedWorkRunsOnEachInstancesOwnQueue() async throws {

        try await withTrackFolder { folder in
            let first = try await TrackFile(url: folder.appendingPathComponent("first.caf"))
            let second = try await TrackFile(url: folder.appendingPathComponent("second.caf"))
            #expect(first.queue !== second.queue)
            await first.checkFileQueue()
            await second.checkFileQueue()
            try await first.close()
            try await second.close()
        }
    }

    @Test func releasingTheLastReferenceReleasesTheBindingOnTheFilesQueue() async throws {

        try await withTrackFolder { folder in
            let key = DispatchSpecificKey<Void>()
            let released = AsyncStream<Bool>.makeStream()
            var track: TrackFile? = try await TrackFile(
                url: folder.appendingPathComponent("track.caf"),
                makeBinding: { url in
                    ReleaseSpy(disk: try DiskTrackBinding(url: url)) {
                        released.continuation.yield(DispatchQueue.getSpecific(key: key) != nil)
                        released.continuation.finish()
                    }
                },
                makeConversion: { try CompleteConversion(inputRate: $0) }
            )
            try #require(track).queue.setSpecific(key: key, value: ())
            try await track?.close()
            track = nil
            var onQueue = released.stream.makeAsyncIterator()
            #expect(await onQueue.next() == true)
        }
    }
}

/// Reports where its last reference was released.
private final class ReleaseSpy: TrackFileBinding {

    private let disk: DiskTrackBinding
    private let onRelease: @Sendable () -> Void

    init(disk: DiskTrackBinding, onRelease: @escaping @Sendable () -> Void) {

        self.disk = disk
        self.onRelease = onRelease
    }

    deinit { onRelease() }

    func initialize() throws { try disk.initialize() }
    func write(_ samples: [Int16], at frame: Int64) throws { try disk.write(samples, at: frame) }
    func read(from frame: Int64, count: Int) throws -> [Float] { try disk.read(from: frame, count: count) }
    func finalize(frames: Int64) throws { try disk.finalize(frames: frames) }
    func remove() { disk.remove() }
}

private extension TrackFile {

    func checkFileQueue() async {

        dispatchPrecondition(condition: .onQueue(queue))
        await Task.yield()
        dispatchPrecondition(condition: .onQueue(queue))
    }
}
