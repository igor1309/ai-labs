import LiveText
import PanelUI
import Recording
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
        let panel = makeAudelinPanel(now: clock.time.monotonicNow, ticks: clock.ticks, sink: TestLogSink(), intervals: testIntervals, browser: { nil }, sleep: { _ in }, zoomName: unknownZoomName)
        panel.begin(id: 1, text: text.stream, speakers: speakers.stream)
        panel.sessionChanged(id: 1, SessionState(phase: .recording), at: clock.time.monotonicNow())
        speakers.continuation.yield([1: 1, 2: 2])
        speakers.continuation.finish()
        func far(_ id: Int) -> CallState.Entry {
            .init(speaker: .theirs, text: .init(id: id, start: Double(id), end: Double(id) + 1, words: [.init("far\(id)", start: Double(id), end: Double(id) + 1)], settledCount: 1), writtenLater: false)
        }
        text.continuation.yield(.init(status: .listening, entries: .init(tail: [far(1), far(2)]), finalCount: 2))
        for await shown in panel.states() {
            guard case let .lines(lines) = shown.log, lines.entries.count == 2 else { continue }
            #expect(lines.entries.map(\.remoteSpeaker) == [nil, nil])
            break
        }
        text.continuation.finish()
        for await shown in panel.states() {
            guard case let .lines(lines) = shown.log, lines.entries.contains(where: { $0.remoteSpeaker != nil }) else { continue }
            #expect(lines.entries.map(\.remoteSpeaker) == [1, 2])
            break
        }
        panel.sessionChanged(id: 1, .init(phase: .ended), at: clock.time.monotonicNow())
        clock.finish()
    }

    /// The recording ends while its last text and speakers still wait for the panel's text task;
    /// the finished call still shows them.
    @MainActor
    @Test func anEndedRecordingStillShowsItsLastTextAndSpeakers() async throws {
        let clock = FixtureClock(), text = AsyncStream<CallState>.makeStream(), speakers = AsyncStream<[Int: Int]>.makeStream()
        let panel = makeAudelinPanel(now: clock.time.monotonicNow, ticks: clock.ticks, sink: TestLogSink(), intervals: testIntervals, browser: { nil }, sleep: { _ in }, zoomName: unknownZoomName)
        panel.begin(id: 1, text: text.stream, speakers: speakers.stream)
        panel.sessionChanged(id: 1, SessionState(phase: .recording), at: clock.time.monotonicNow())
        func far(_ id: Int) -> CallState.Entry {
            .init(speaker: .theirs, text: .init(id: id, start: Double(id), end: Double(id) + 1, words: [.init("far\(id)", start: Double(id), end: Double(id) + 1)], settledCount: 1), writtenLater: false)
        }
        text.continuation.yield(.init(status: .listening, entries: .init(tail: [far(1), far(2)]), finalCount: 2))
        speakers.continuation.yield([1: 1, 2: 2])
        panel.sessionChanged(id: 1, .init(phase: .ended), at: clock.time.monotonicNow())
        text.continuation.finish()
        speakers.continuation.finish()
        for await shown in panel.states() {
            #expect(shown.recording == .off)
            guard case let .lines(lines) = shown.log, lines.entries.contains(where: { $0.remoteSpeaker != nil }) else { continue }
            #expect(lines.entries.map(\.remoteSpeaker) == [1, 2])
            break
        }
        panel.languageChanged(.init(language: .english))
        let translated = try #require(await panel.states().first { @Sendable state in
            guard case let .lines(lines) = state.log else { return false }
            return lines.entries.map(\.label) == ["Them 1", "Them 2"]
        })
        #expect(translated.recording == .off)
        clock.finish()
    }
}
