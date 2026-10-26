import Dispatch
import Testing
@testable import TranscriptFile

@Suite(.timeLimit(.minutes(1)))
struct TranscriptFileExecutorTests {

    @Test func isolatedWorkRunsOnEachInstancesOwnQueue() async throws {

        try await withTranscriptFolder { folder in
            let first = try TranscriptFile(url: folder.appendingPathComponent("first.md"))
            let second = try TranscriptFile(url: folder.appendingPathComponent("second.md"))
            #expect(first.queue !== second.queue)
            await first.checkFileQueue()
            await second.checkFileQueue()
            await first.close()
            await second.close()
        }
    }
}

private extension TranscriptFile {

    func checkFileQueue() async {

        dispatchPrecondition(condition: .onQueue(queue))
        await Task.yield()
        dispatchPrecondition(condition: .onQueue(queue))
    }
}
