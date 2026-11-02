import Foundation
import PanelUI
import Reading
import Session
import Testing
@testable import Composer

@Suite(.timeLimit(.minutes(1)))
struct PanelProblemTests {

    /// A lost capture shows at the time it was lost, on the clock the
    /// recording runs by, and stays at that time while the clock goes on.
    @MainActor
    @Test func aLostCaptureReachesThePanelOnItsRecordingClock() async throws {
        try await withComposition(preferences: { .init(automaticRecording: false, liveText: false, callsFolder: $0) }) { rig in
            try await rig.start()
            _ = try await rig.panel { $0.recording == .on(elapsed: "00:00:00") }
            rig.clock.advance(65.9)
            _ = try await rig.panel { $0.recording == .on(elapsed: "00:01:05") }
            rig.call.source.continuation.finish(throwing: ScriptFailure.failed)
            let shown = try await rig.panel { $0.banners.contains(.callAudio) }
            #expect(shown.banners == [.callAudio])
            #expect(shown.log == .liveTextOff(kept: .init(rows: [
                .gap(.init(speaker: .them, text: "— нет звука звонка с 01:05 —")),
            ])))
            rig.clock.advance(10)
            let later = try await rig.panel { $0.recording == .on(elapsed: "00:01:15") }
            #expect(later.banners == [.callAudio])
            #expect(later.log == shown.log)
            try await rig.stop()
        }
    }

    @Test func everyMenuFaultHasTheSamePanelFaultIncludingTheFailedTrackSide() {
        for side: SessionSide in [.microphone, .call] {
            for piece: SessionState.Piece in [.access(side), .capture(side)] {
                for health: SessionState.Health in [.failed("fault"), .accessLost] {
                    let state = SessionState(health: [piece: health], phase: .recording)
                    #expect(readingFaultKinds(state) == [side == .microphone ? .microphone : .callAudio])
                    #expect(recordingFaults(state) == [side == .microphone ? .microphone : .callAudio])
                }
            }
            let state = SessionState(health: [.track(side): .failed("disk")], phase: .recording)
            #expect(readingFaultKinds(state) == [.diskFull(side == .microphone ? .mine : .theirs)])
            #expect(recordingFaults(state) == [.diskFull])
        }
        #expect(readingFaultKinds(.init(health: [.folder: .failed("folder"), .transcript: .failed("text")])).isEmpty)
    }
}
