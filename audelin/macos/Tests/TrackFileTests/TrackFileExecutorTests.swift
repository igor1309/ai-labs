import BlockingTestWork
import Dispatch
import Foundation
import Testing
@testable import TrackFile

@Suite(.timeLimit(.minutes(1)))
struct TrackFileExecutorTests {

    @Test func blockedFilesOutnumberingThePoolAllKeepWriting() async throws {

        try await withTrackFolder { folder in
            let barrier = ThreadBarrier()
            var tracks: [TrackFile] = []
            for index in 0..<barrier.count {
                tracks.append(try await TrackFile(
                    url: folder.appendingPathComponent("\(index).caf"),
                    makeBinding: { url in BarrierTrackBinding(disk: try DiskTrackBinding(url: url), barrier: barrier) },
                    makeConversion: { try CompleteConversion(inputRate: $0) }
                ))
            }
            try await withThrowingTaskGroup { group in
                for track in tracks {
                    group.addTask { try await track.write([Float](repeating: 0, count: 1_600), sampleRate: 16_000) }
                }
                try await group.waitForAll()
            }
            #expect(barrier.met)
            for track in tracks { try await track.close() }
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

/// Blocks each write of samples.
private struct BarrierTrackBinding: TrackFileBinding {

    let disk: DiskTrackBinding
    let barrier: ThreadBarrier

    func initialize() throws { try disk.initialize() }

    func write(_ samples: [Int16], at frame: Int64) throws {

        barrier.arrive()
        try disk.write(samples, at: frame)
    }

    func read(from frame: Int64, count: Int) throws -> [Float] { try disk.read(from: frame, count: count) }
    func finalize(frames: Int64) throws { try disk.finalize(frames: frames) }
    func remove() { disk.remove() }
}
