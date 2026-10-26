import Dispatch
import Testing
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct SessionPiecesExecutorTests {

    @Test func isolatedWorkRunsOnEachInstancesOwnQueue() async throws {

        try await withSessionRig { first, _ in
            try await withSessionRig { second, _ in
                #expect(first.pieces.queue !== second.pieces.queue)
                await first.pieces.checkFileQueue()
                await second.pieces.checkFileQueue()
            }
        }
    }
}

private extension SessionPieces {

    func checkFileQueue() async {

        dispatchPrecondition(condition: .onQueue(queue))
        await Task.yield()
        dispatchPrecondition(condition: .onQueue(queue))
    }
}
