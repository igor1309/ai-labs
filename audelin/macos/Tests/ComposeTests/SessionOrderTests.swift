import Session
import Testing
@testable import Audelin
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct SessionOrderTests {

    @Test func portsRejectUnknownIdentities() async throws {

        try await withSessionRig { rig, _ in
            let pieces = rig.pieces
            await #expect(throws: SessionPieces.Failure.unknownFolder("unknown")) {
                try await pieces.microphoneTrack.open(in: .init(id: "unknown"))
            }
            await #expect(throws: SessionPieces.Failure.unknownSelection("unknown")) {
                try await pieces.callCapture.start(selection: .chosen(.init(id: "unknown")))
            }
            await rig.session.send(.begin(liveText: true))
            let selection = try #require(try await rig.state { $0.phase == .recording }.processSelection)
            await #expect(throws: SessionPieces.Failure.unknownSelection(selection.id + "-other")) {
                try await pieces.callCapture.start(selection: .chosen(.init(id: selection.id + "-other")))
            }
        }
    }
}

@Suite(.timeLimit(.minutes(1)))
struct SessionReleaseTests {

    @Test func anEndedSessionReleasesItsHandler() async throws {

        try await withSessionRig { rig, _ in
            let released = AsyncStream<Void>.makeStream()
            var handler: SessionEffectHandler? = rig.pieces.handler(sink: ReleaseSink { released.continuation.finish() })
            var session: SessionInputs? = await makeSession(handler: try #require(handler))
            handler = nil
            await session?.end()
            session = nil
            // The model's loop lets go of its actor, and so of the handler and its sink, once
            // the model is released; a handler kept alive holds this wait until the time limit.
            for await _ in released.stream {}
        }
    }
}

/// Reports when the handler that holds it lets go.
private final class ReleaseSink: LogSink {

    private let onRelease: @Sendable () -> Void

    init(onRelease: @escaping @Sendable () -> Void) { self.onRelease = onRelease }

    deinit { onRelease() }

    func write(_ entry: LogEntry) {}
}
