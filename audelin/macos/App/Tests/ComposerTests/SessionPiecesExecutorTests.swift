import BlockingTestWork
import Testing
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct SessionPiecesExecutorTests {

    @Test func blockedPiecesOutnumberingThePoolAllKeepCheckingModels() async throws {

        let barrier = ThreadBarrier()
        var construction = SessionConstruction()
        construction.missingModels = {
            barrier.arrive()
            return []
        }

        try await withRigs(barrier.count, construction: construction) { rigs in
            await withTaskGroup { group in
                for rig in rigs { group.addTask { _ = await rig.pieces.missing() } }
            }
        }

        #expect(barrier.met)
    }

    private func withRigs(
        _ count: Int, construction: SessionConstruction, opened: [SessionRig] = [],
        _ body: ([SessionRig]) async throws -> Void
    ) async throws {

        guard opened.count < count else { return try await body(opened) }
        try await withSessionRig(construction: construction) { rig, _ in
            try await withRigs(count, construction: construction, opened: opened + [rig], body)
        }
    }
}
