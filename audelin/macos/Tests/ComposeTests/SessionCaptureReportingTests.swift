import Foundation
import Session
import Testing
import TrackFile
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct SessionCaptureReportingTests {

    @Test(arguments: [SessionSide.microphone, .call], [false, true])
    func stopFailurePrecedesEndWhileForwardingIsHeld(side: SessionSide, stopEndsStream: Bool) async throws {

        let release = Signal(), forwarded = Values<SessionEvent>()
        defer { release.end() }
        try await withSessionRig(stopFailure: side, stopEndsStream: stopEndsStream, beforeForward: { event in
            await release.next()
            forwarded.append(event)
        }) { rig, _ in
            defer { release.end() }
            rig.session.send(.begin(liveText: true))
            _ = try await rig.state { $0.phase == .recording }
            rig.session.send(.end)
            let ended = try await rig.state { $0.phase == .ended }
            #expect(ended.failures == [.init(piece: "\(side) capture", message: "failed")])
            #expect(ended.health(of: .capture(side)) == .failed("failed"))
            release.end()
            await rig.subscription.value
            #expect(forwarded.all.isEmpty)
        }
    }

    @Test(arguments: [SessionSide.microphone, .call])
    func streamFailingBeforeAnyPieceReachesSession(side: SessionSide) async throws {

        try await withSessionRig(streamFailure: side) { rig, _ in
            rig.session.send(.begin(liveText: true))
            let state = try await rig.state { $0.health(of: .capture(side)) != .fine }
            #expect(state.health(of: .capture(side)) == .failed(String(describing: ScriptFailure.failed)))
            #expect(state.failures == [.init(piece: "\(side) capture", message: String(describing: ScriptFailure.failed))])
            let stopped = try await rig.state { (side == .microphone ? $0.microphoneCapture : $0.callCapture) == .closed }
            #expect(stopped.phase != .ending && stopped.phase != .ended)
            let script = side == .microphone ? rig.microphone.stops.all : rig.call.stops.all
            #expect(script == [true])
        }
    }

    @Test func switchingTextOnMarksUndeliveredCaptureAsWrittenLater() async throws {

        let delivery = Signal(), written = Signal()
        defer { delivery.end(); written.end() }
        var construction = SessionConstruction()
        construction.makeCaptureAudio = { _, live in
            HeldCaptureAudio(base: LiveCaptureAudio(capture: live), release: { await delivery.next() })
        }
        construction.recordingTrack = { _, track in ReportingTrack(track: track, written: written) }
        try await withSessionRig(construction: construction) { rig, _ in
            defer { delivery.end() }
            rig.session.send(.begin(liveText: false))
            _ = try await rig.state { $0.phase == .recording }
            await written.next()
            await written.next()
            rig.session.send(.liveTextChanged(true))
            _ = try await rig.state { $0.pendingLiveText == nil && $0.wantedLiveText }
            delivery.end()
            await rig.mine.heard.next()
            await rig.theirs.heard.next()
            rig.session.send(.end)
            _ = try await rig.state { $0.phase == .ended }
            let text = try #require(await rig.pieces.text)
            let state = await text.state
            #expect(state.entries.map(\.text.settled) == ["mine final", "theirs final"])
            #expect(state.entries.map(\.writtenLater) == [true, true])
        }
    }
}

private struct ReportingTrack: RecordingTrack {

    let track: TrackFile
    let written: Signal

    func write(_ samples: [Float], sampleRate: Double) async throws {

        try await track.write(samples, sampleRate: sampleRate)
        written.send()
    }
}
