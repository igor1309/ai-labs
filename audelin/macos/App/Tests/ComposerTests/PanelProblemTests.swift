import struct CallText.State
import Foundation
import PanelUI
import Reading
import Session
import Testing
@testable import Composer

struct PanelProblemTests {

    @Test func sessionProblemsReachThePanelOnItsRecordingClock() async throws {
        let clock = ReadingClockSpy()
        let panel = clock.panel()
        let text = AsyncStream<State>.makeStream()
        let subscription = await panel.begin(id: 1, text: text.stream, enableLiveText: {})
        do {
            await subscription.sessionChanged(.init(phase: .recording))
            var states = await panel.states().makeAsyncIterator()
            _ = try await next(&states) { $0.recording == .on(elapsed: "00:00:00") }
            clock.advance(65.9)
            await subscription.sessionChanged(.init(health: [
                .capture(.call): .failed("lost"), .track(.microphone): .failed("full"),
            ], phase: .recording, audioWarning: .callSilent))
            let shown = try await next(&states) { $0.banners.count == 3 }
            #expect(shown.banners == [.callSilent, .callAudio, .diskFull(savedUntil: "01:05")])
            #expect(shown.recording == .on(elapsed: "00:01:05"))
            #expect(shown.log == .liveTextOff(kept: .init(rows: [
                .gap(.init(speaker: .me, text: "— диск заполнен с 01:05 —")),
                .gap(.init(speaker: .them, text: "— нет звука звонка с 01:05 —")),
            ])))
            clock.advance(10)
            await subscription.sessionChanged(.init(phase: .recording))
            let cleared = try await next(&states) { $0.banners.count == 2 }
            #expect(cleared.banners == [.callAudio, .diskFull(savedUntil: "01:05")])
            #expect(cleared.log == shown.log)
            await subscription.sessionChanged(.init(phase: .recording, audioWarning: .callSilent))
            let warnedAgain = try await next(&states) { $0.banners.count == 3 }
            #expect(warnedAgain.banners.first == .callSilent)
            #expect(warnedAgain.log == shown.log)
            await panel.end(id: 1)
            await subscription.end()
        } catch {
            await panel.end(id: 1)
            await subscription.end()
            text.continuation.finish()
            throw error
        }
        text.continuation.finish()
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

private func next(
    _ states: inout AsyncStream<PanelState>.Iterator, matching: (PanelState) -> Bool
) async throws -> PanelState {
    while let state = await states.next() {
        if matching(state) { return state }
    }
    throw ScriptFailure.failed
}
