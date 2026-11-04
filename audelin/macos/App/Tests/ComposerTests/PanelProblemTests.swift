import BlockingTestWork
import Foundation
import MenuBar
import Observation
import Recording
import PanelUI
import Testing
import Composer

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

    @MainActor
    @Test(arguments: [ComposerSide.microphone, .call], ["start", "stream", "track"])
    func boundaryFailuresReachBothThePanelAndMenu(side: ComposerSide, stage: String) async throws {
        let source = BoundaryCapture()
        let track = MemoryRecording(failingWrite: stage == "track" ? 1 : nil)
        defer { source.finish() }
        try await withComposition(preferences: { .init(automaticRecording: false, liveText: false, callsFolder: $0) },
            configure: { boundary in
                let start: @Sendable () throws -> StartedCapture<CaptureBuffer> = {
                    if stage == "start" { throw ScriptFailure.failed }
                    return source.start()
                }
                if side == .microphone { boundary.microphone = FixtureMicrophone { try start() } }
                else { boundary.callAudio = FixtureCallAudio { _ in try start() } }
                boundary.recordings = FixtureRecordings(
                    microphone: side == .microphone ? track : MemoryRecording(),
                    call: side == .call ? track : MemoryRecording())
            }) { rig in
                try await rig.start()
                if stage != "start" {
                    _ = try await rig.panel { $0.recording == .on(elapsed: "00:00:00") }
                    rig.clock.advance(65)
                    _ = try await rig.panel { $0.recording == .on(elapsed: "00:01:05") }
                    if stage == "stream" { source.finish(.capture) }
                    else { source.give([boundaryTones[0]]) }
                }
                let fault: RecordingFault = stage == "track" ? .diskFull : (side == .microphone ? .microphone : .callAudio)
                _ = try await rig.state { $0.faults == [fault] }
                let banner: PanelState.Banner = stage == "track" ? .diskFull(savedUntil: "01:05")
                    : (side == .microphone ? .microphone : .callAudio)
                let shown = try await rig.panel { $0.banners == [banner] }
                let time = stage == "start" ? "00:00" : "01:05"
                let reason = stage == "track" ? "диск заполнен" : (side == .microphone ? "нет микрофона" : "нет звука звонка")
                #expect(shown.log == .liveTextOff(kept: .init(rows: [
                    .gap(.init(speaker: side == .microphone ? .me : .them, text: "— \(reason) с \(time) —")),
                ])))
                for await state in Observations({ rig.menu.state }) where state.faults == [fault] { break }
                let label = stage == "track" ? "Диск заполнен, дорожка остановлена"
                    : (side == .microphone ? "Микрофон не пишется" : "Звук звонка не пишется")
                #expect(rig.menu.menu.entries.first == .stateLine("Запись без текста; \(label)"))
                #expect(rig.menu.menu.item.isRed)
                try await rig.stop()
            }
    }

    @MainActor
    @Test func aTranscriptFailureDoesNotCreateAudioGaps() async throws {
        try await withComposition { rig in
            try await rig.start()
            await rig.clock.waitForSleep(.seconds(5))
            let folder = rig.folder()
            try await offPool { try FileManager.default.removeItem(at: folder) }
            rig.clock.wake(.seconds(5))
            await rig.log.wait { $0.category == .session && $0.error?.contains("transcript:") == true }
            rig.clock.advance(1)
            let shown = try await rig.panel { $0.recording == .on(elapsed: "00:00:01") }
            #expect(shown.banners.isEmpty)
            #expect(rig.menu.state.faults.isEmpty)
            try await rig.stop()
        }
    }
}
