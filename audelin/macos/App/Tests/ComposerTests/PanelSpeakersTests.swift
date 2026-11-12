import LiveText
import PanelUI
import Session
import Testing
@testable import CallText
@testable import Composer

@Suite(.timeLimit(.minutes(1)))
struct PanelSpeakersTests {

    /// The speakers can arrive before the call's last text; the panel still gives them to
    /// the rows that text brings.
    @MainActor
    @Test func theSessionsSpeakersReachTheRowsOfItsLastText() async throws {
        let clock = FixtureClock(), text = AsyncStream<CallState>.makeStream(), speakers = AsyncStream<[Int: Int]>.makeStream()
        let panel = AudelinPanel(now: clock.time.monotonicNow, ticks: clock.ticks, sink: TestLogSink(), intervals: testIntervals)
        let reading = await panel.begin(id: 1, text: text.stream, speakers: speakers.stream, enableLiveText: {})
        reading.sessionChanged(SessionState(phase: .recording))
        speakers.continuation.yield([1: 1, 2: 2])
        speakers.continuation.finish()
        func far(_ id: Int) -> CallState.Entry {
            .init(speaker: .theirs, text: .init(id: id, start: Double(id), end: Double(id) + 1, words: [.init("far\(id)", start: Double(id), end: Double(id) + 1)], settledCount: 1), writtenLater: false)
        }
        text.continuation.yield(.init(status: .listening, entries: .init(tail: [far(1), far(2)]), finalCount: 2))
        text.continuation.finish()
        for await shown in await panel.states() {
            guard case let .lines(lines) = shown.log, lines.entries.contains(where: { $0.remoteSpeaker != nil }) else { continue }
            #expect(lines.entries.map(\.remoteSpeaker) == [1, 2])
            break
        }
        await reading.end()
        await panel.end(id: 1)
        clock.finish()
    }
}
