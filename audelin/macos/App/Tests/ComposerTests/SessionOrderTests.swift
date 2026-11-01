import Composer
import Testing

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct SessionReleaseTests {
    @Test func anEndedSessionReleasesItsHandler() async throws {
        let released = AsyncStream<Void>.makeStream()
        try await withComposeFolder { root in
            let fixture = try await ComposeFixture.make(root: root, configure: { boundary in
                boundary.log = ReleaseSink { released.continuation.finish() }
            })
            do {
                try await fixture.start()
                try await fixture.stop()
                await fixture.finish()
            } catch { await fixture.finish(); throw error }
        }
        for await _ in released.stream {}
    }
}

private final class ReleaseSink: LogSink {
    private let onRelease: @Sendable () -> Void
    init(onRelease: @escaping @Sendable () -> Void) { self.onRelease = onRelease }
    deinit { onRelease() }
    func write(_ entry: LogEntry) {}
}
