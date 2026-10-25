import Session
import Testing
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct SessionOrderTests {

    @Test func portsRejectUnknownIdentitiesAndOutOfOrderCalls() async throws {

        try await withSessionRig { rig, _ in
            let pieces = rig.pieces
            await #expect(throws: SessionPieces.Failure.unknownFolder("unknown")) {
                try await pieces.microphoneTrack.open(in: .init(id: "unknown"))
            }
            await #expect(throws: SessionPieces.Failure.unknownSelection("unknown")) {
                try await pieces.callCapture.start(selection: .init(id: "unknown"))
            }
            await #expect(throws: SessionPieces.Failure.outOfOrder("microphone track is not open")) {
                try await pieces.start(enabled: true)
            }
            await #expect(throws: SessionPieces.Failure.outOfOrder("call text is not running")) {
                try await pieces.setEnabled(true)
            }
            await #expect(throws: SessionPieces.Failure.outOfOrder("microphone track is not open")) {
                try await pieces.microphoneCapture.start()
            }
            rig.session.send(.begin(liveText: true))
            _ = try await rig.state { $0.phase == .recording }
            let selection = try #require((await rig.session.snapshot()).processSelection)
            await #expect(throws: SessionPieces.Failure.unknownSelection(selection.id + "-other")) {
                try await pieces.callCapture.start(selection: .init(id: selection.id + "-other"))
            }
            let made = try #require(await pieces.made)
            await #expect(throws: SessionPieces.Failure.outOfOrder("folder already created")) {
                _ = try await pieces.create()
            }
            for side in [SessionSide.microphone, .call] {
                let port = side == .microphone ? pieces.microphoneTrack : pieces.callTrack
                await #expect(throws: SessionPieces.Failure.outOfOrder("\(side) track already opened")) {
                    try await port.open(in: .init(id: made.url.path))
                }
                await #expect(throws: SessionPieces.Failure.outOfOrder("\(side) capture is still running")) {
                    try await port.close()
                }
            }
            await #expect(throws: SessionPieces.Failure.outOfOrder("call text already started")) {
                try await pieces.start(enabled: true)
            }
            await #expect(throws: SessionPieces.Failure.outOfOrder("transcript already opened")) {
                try await pieces.transcript.open(in: .init(id: made.url.path))
            }
            await #expect(throws: SessionPieces.Failure.outOfOrder("call text is still running")) {
                try await pieces.transcript.close()
            }
        }
    }
}
