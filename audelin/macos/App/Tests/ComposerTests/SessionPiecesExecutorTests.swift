import BlockingTestWork
import Composer
import Foundation
import SessionRehearsal
import Testing

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct SessionPiecesExecutorTests {
    @Test func blockedPiecesOutnumberingThePoolAllKeepCheckingModels() async throws {
        let barrier = ThreadBarrier()
        try await withComposeFolder { root in
            var fixtures: [ComposeFixture] = []
            for index in 0..<barrier.count {
                let folder = root.appendingPathComponent(String(index))
                try await offPool { try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false) }
                let fixture = try await ComposeFixture.make(root: folder, configure: { boundary in
                    let recognizers = boundary.recognizers
                    boundary.recognizers = FixtureRecognizers(source: { try await recognizers.recognizer(for: $0) },
                        missing: { barrier.arrive(); return [] }, load: { recognizers.startLoading() })
                })
                fixtures.append(fixture)
            }
            await withTaskGroup { group in
                for fixture in fixtures {
                    group.addTask {
                        await fixture.menu.perform(.start)
                        for await state in await fixture.menu.states() where state.phase == .recording { break }
                    }
                }
            }
            for fixture in fixtures { await fixture.finish() }
            #expect(barrier.met)
        }
    }
}
