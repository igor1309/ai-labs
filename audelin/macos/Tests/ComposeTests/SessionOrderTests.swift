import Session
import Testing
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
            _ = try await rig.state { $0.phase == .recording }
            let selection = try #require((await rig.session.snapshot()).processSelection)
            await #expect(throws: SessionPieces.Failure.unknownSelection(selection.id + "-other")) {
                try await pieces.callCapture.start(selection: .chosen(.init(id: selection.id + "-other")))
            }
        }
    }
}
