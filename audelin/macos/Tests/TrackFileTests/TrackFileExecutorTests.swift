import Dispatch
import Testing
@testable import TrackFile

@Suite(.timeLimit(.minutes(1)))
struct TrackFileExecutorTests {

    @Test func isolatedWorkRunsOnEachInstancesOwnQueue() async throws {

        try await withTrackFolder { folder in
            let first = try TrackFile(url: folder.appendingPathComponent("first.caf"))
            let second = try TrackFile(url: folder.appendingPathComponent("second.caf"))
            #expect(first.queue !== second.queue)
            await first.checkFileQueue()
            await second.checkFileQueue()
            try await first.close()
            try await second.close()
        }
    }
}

private extension TrackFile {

    func checkFileQueue() async {

        dispatchPrecondition(condition: .onQueue(queue))
        await Task.yield()
        dispatchPrecondition(condition: .onQueue(queue))
    }
}
