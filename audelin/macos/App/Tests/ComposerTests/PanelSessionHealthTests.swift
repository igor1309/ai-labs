import PanelUI
import Session
import Testing
@testable import Composer

@Suite(.timeLimit(.minutes(1)))
struct PanelSessionHealthTests {
    /// Session health is the panel owner's input, including access failures
    /// distinct from the capture stream's failures.
    @MainActor
    @Test(arguments: [SessionSide.microphone, .call])
    func sessionHealthKeepsEveryFailureCategoryAndTrackSide(side: SessionSide) async throws {
        let variants: [(SessionState.Piece, SessionState.Health, PanelState.Banner, String)] = [
            (.access(side), .failed("fault"), side == .microphone ? .microphone : .callAudio,
             side == .microphone ? "нет микрофона" : "нет звука звонка"),
            (.access(side), .accessLost, side == .microphone ? .microphone : .callAudio,
             side == .microphone ? "нет микрофона" : "нет звука звонка"),
            (.capture(side), .failed("fault"), side == .microphone ? .microphone : .callAudio,
             side == .microphone ? "нет микрофона" : "нет звука звонка"),
            (.capture(side), .accessLost, side == .microphone ? .microphone : .callAudio,
             side == .microphone ? "нет микрофона" : "нет звука звонка"),
            (.track(side), .failed("disk"), .diskFull(savedUntil: "00:00"), "диск заполнен"),
        ]
        for (piece, health, banner, reason) in variants {
            let clock = FixtureClock(), text = AsyncStream<CallState>.makeStream()
            let panel = AudelinPanel(now: clock.time.monotonicNow, ticks: clock.ticks, sink: TestLogSink(), intervals: testIntervals, browser: { nil }, sleep: { _ in })
            let reading = await panel.begin(id: 1, text: text.stream, enableLiveText: {})
            reading.sessionChanged(SessionState(health: [piece: health], phase: .recording))
            for await shown in await panel.states() where shown.banners == [banner] {
                #expect(shown.log == .liveTextOff(kept: .init(rows: [
                    .gap(.init(speaker: side == .microphone ? .me : .them, text: "— \(reason) с 00:00 —")),
                ])))
                break
            }
            text.continuation.finish()
            await reading.end()
            await panel.end(id: 1)
            clock.finish()
        }
    }

    @MainActor
    @Test func folderAndTranscriptHealthDoNotCreateAudioProblems() async throws {
        let clock = FixtureClock(), text = AsyncStream<CallState>.makeStream()
        let panel = AudelinPanel(now: clock.time.monotonicNow, ticks: clock.ticks, sink: TestLogSink(), intervals: testIntervals, browser: { nil }, sleep: { _ in })
        let reading = await panel.begin(id: 1, text: text.stream, enableLiveText: {})
        reading.sessionChanged(SessionState(health: [.folder: .failed("folder"), .transcript: .failed("text")], phase: .recording))
        for await shown in await panel.states() where shown.recording == .on(elapsed: "00:00:00") {
            #expect(shown.banners.isEmpty)
            #expect(shown.log == .liveTextOff(kept: nil))
            break
        }
        text.continuation.finish()
        await reading.end()
        await panel.end(id: 1)
        clock.finish()
    }
}
