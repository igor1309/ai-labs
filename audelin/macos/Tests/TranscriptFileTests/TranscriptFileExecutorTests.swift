import BlockingTestWork
import Foundation
import Testing
@testable import TranscriptFile

@Suite(.timeLimit(.minutes(1)))
struct TranscriptFileExecutorTests {

    @Test func blockedFilesOutnumberingThePoolAllKeepWriting() async throws {

        try await withTranscriptFolder { folder in
            let barrier = ThreadBarrier()
            var files: [TranscriptFile] = []
            for index in 0..<barrier.count {
                files.append(try await TranscriptFile(
                    url: folder.appendingPathComponent("\(index).md"),
                    binding: BarrierTranscriptBinding(barrier: barrier)
                ))
            }
            try await withThrowingTaskGroup { group in
                for file in files { group.addTask { try await file.write([]) } }
                try await group.waitForAll()
            }
            #expect(barrier.met)
            for file in files { await file.close() }
        }
    }
}

/// Blocks at the rename, which only a snapshot written after opening reaches.
private struct BarrierTranscriptBinding: TranscriptFileBinding {

    let barrier: ThreadBarrier
    private let disk = DiskTranscriptBinding()

    func create(at url: URL) throws -> any TranscriptFileHandle { try disk.create(at: url) }

    func open(at url: URL) throws -> any TranscriptFileHandle { try disk.open(at: url) }

    func rename(from source: URL, to target: URL) throws {

        barrier.arrive()
        try disk.rename(from: source, to: target)
    }

    func remove(at url: URL) { disk.remove(at: url) }
}
