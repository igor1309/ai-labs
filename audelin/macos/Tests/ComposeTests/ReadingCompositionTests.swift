@testable import CallText
import PanelUI
import Reading
import Recording
import Session
import Synchronization
import Testing
import protocol TranscriptWriting.CallText
@testable import Compose

struct ReadingCompositionTests {

    @Test func textUpdatesReachPanelAndLogsContainOnlyModesAndCounts() async throws {

        let clock = ReadingClockSpy(), sink = ReadingLogSpy()
        let panel = AudelinPanel(now: clock.now, ticks: clock.ticks, sink: sink)
        let input = AsyncStream<State>.makeStream()
        try await withReading(panel, id: 1, text: input.stream) {
            var states = await panel.states().makeAsyncIterator()
            input.continuation.yield(.init(status: .listening, entries: [callEntry(.mine, 3, start: 12, settled: "private words", pending: " private draft")]))
            let shown = try await nextPanel(&states) { if case .lines = $0.log { true } else { false } }
            let lines = try #require(shown.lines)
            #expect(lines.entries == [.init(id: 0, time: "00:12", speaker: .me, settled: "private words", pending: " private draft")])
            input.continuation.yield(.init(status: .off, entries: []))
            let off = try await nextPanel(&states) { if case .liveTextOff = $0.log { true } else { false } }
            #expect(off.log == .liveTextOff(kept: lines))
            input.continuation.yield(.init(status: .gettingReady, entries: []))
            let preparing = try await nextPanel(&states) { if case .preparing = $0.log { true } else { false } }
            #expect(preparing.log == .preparing(holds: []))
            input.continuation.yield(.init(status: .failed("private failure"), entries: [callEntry(.mine, 3, start: 12, settled: "private final")]))
            _ = try await nextPanel(&states) { $0.lines?.entries.first?.settled == "private final" }
            #expect(sink.entries.all.contains(.init(category: .reading, message: "state recording=on log=lines rows=1 entries=1 holds=0 newBelow=0 followsLive=true")))
        }
        input.continuation.finish()
        #expect(sink.entries.all.last == .init(category: .reading, message: "state recording=off log=lines rows=1 entries=1 holds=0 newBelow=0 followsLive=true"))
        #expect(sink.entries.all.allSatisfy {
            $0.category == .reading && !$0.message.contains("private") && $0.error == nil && $0.path == nil
        })
    }

    @Test func aLaterRecordingStartsEmptyAndCannotReceiveAnEarlierRecordingsText() async throws {

        let clock = ReadingClockSpy()
        let panel = AudelinPanel(now: clock.now, ticks: clock.ticks, sink: ReadingLogSpy())
        let first = AsyncStream<State>.makeStream(), second = AsyncStream<State>.makeStream()
        try await withReading(panel, id: 1, text: first.stream) {
            var states = await panel.states().makeAsyncIterator()
            first.continuation.yield(.init(status: .listening, entries: [callEntry(.mine, 1, settled: "first recording")]))
            _ = try await nextPanel(&states) { $0.lines?.entries.first?.settled == "first recording" }
            await panel.send(.hold(.init(entryID: 0, text: "held first")))
            _ = try await nextPanel(&states) { $0.lines?.holds.count == 1 }
            try await withReading(panel, id: 2, text: second.stream) {
                var next = await panel.states().makeAsyncIterator()
                #expect(await next.next() == .init(recording: .on(elapsed: "00:00:00"), log: .liveTextOff(kept: nil)))
                first.continuation.yield(.init(status: .listening, entries: [callEntry(.mine, 1, settled: "stale revision")]))
                second.continuation.yield(.init(status: .listening, entries: [callEntry(.theirs, 1, settled: "second recording")]))
                let shown = try await nextPanel(&next) { $0.lines?.entries.first?.settled == "second recording" }
                #expect(shown.lines?.entries == [.init(id: 0, time: "00:00", speaker: .them, settled: "second recording")])
                #expect(shown.lines?.holds == [])
                #expect(shown.lines?.newBelow == 0)
                #expect(shown.lines?.followsLive == true)
            }
        }
        first.continuation.finish(); second.continuation.finish()
        var ended = await panel.states().makeAsyncIterator()
        #expect(await ended.next() == .init(recording: .off, log: .empty))
    }

    @Test func elapsedUsesTheRecordingsStartAndStopsWithItsSubscription() async throws {

        let clock = ReadingClockSpy()
        let panel = AudelinPanel(now: clock.now, ticks: clock.ticks, sink: ReadingLogSpy())
        let input = AsyncStream<State>.makeStream()
        try await withReading(panel, id: 1, text: input.stream) {
            var states = await panel.states().makeAsyncIterator()
            _ = try await nextPanel(&states) { $0.recording == .on(elapsed: "00:00:00") }
            clock.advance(1)
            _ = try await nextPanel(&states) { $0.recording == .on(elapsed: "00:00:01") }
            clock.advance(65)
            _ = try await nextPanel(&states) { $0.recording == .on(elapsed: "00:01:06") }
        }
        clock.advance(10)
        var ended = await panel.states().makeAsyncIterator()
        #expect(await ended.next() == .init(recording: .off, log: .empty))
        let second = AsyncStream<State>.makeStream()
        await withReading(panel, id: 2, text: second.stream) {
            var states = await panel.states().makeAsyncIterator()
            #expect(await states.next() == .init(recording: .on(elapsed: "00:00:00"), log: .liveTextOff(kept: nil)))
        }
        input.continuation.finish(); second.continuation.finish()
    }

    @Test func panelActionsReachTheCurrentReading() async throws {

        let clock = ReadingClockSpy()
        let panel = AudelinPanel(now: clock.now, ticks: clock.ticks, sink: ReadingLogSpy())
        let input = AsyncStream<State>.makeStream()
        try await withReading(panel, id: 1, text: input.stream) {
            var states = await panel.states().makeAsyncIterator()
            input.continuation.yield(.init(status: .listening, entries: [callEntry(.mine, 1, settled: "words")]))
            _ = try await nextPanel(&states) { $0.lines?.entries.count == 1 }
            let held = PanelState.Held(entryID: 0, text: "words")
            await panel.send(.hold(held))
            _ = try await nextPanel(&states) { $0.lines?.holds == [held] }
            await panel.send(.scrolled(atBottom: false))
            _ = try await nextPanel(&states) { $0.lines?.followsLive == false }
            input.continuation.yield(.init(status: .listening, entries: [callEntry(.mine, 1, settled: "words"), callEntry(.theirs, 1, start: 2, settled: "new")]))
            _ = try await nextPanel(&states) { $0.lines?.newBelow == 1 }
            await panel.send(.jumpToLive)
            let live = try await nextPanel(&states) { $0.lines?.newBelow == 0 }
            #expect(live.lines?.followsLive == true)
            await panel.send(.letGo(held))
            _ = try await nextPanel(&states) { $0.lines?.holds.isEmpty == true }
        }
        input.continuation.finish()
    }

    @Test func translatesPopulatedReadingAndEveryTextStatusAndLogMode() {

        let statuses: [(State.Status, ReadingTextUpdate.Status)] = [
            (.off, .off), (.gettingReady, .gettingReady), (.listening, .listening),
            (.failed("reason"), .failed("reason")), (.finished, .finished),
        ]
        for (source, expected) in statuses {
            let translated = readingText(.init(status: source, entries: [
                callEntry(.mine, 7, start: 1, settled: "settled", pending: " pending"),
                callEntry(.theirs, 7, start: 3, settled: "late", late: true),
            ]))
            #expect(translated == .init(status: expected, entries: [
                .init(id: .init(speaker: .mine, localID: 7), start: 1, end: 2, settled: "settled", pending: " pending"),
                .init(id: .init(speaker: .theirs, localID: 7), start: 3, end: 4, settled: "late", writtenLater: true),
            ]))
        }
        #expect(panelState(.init()) == .init(recording: .off, log: .empty))
        var reading = ReadingState()
        func send(_ event: ReadingEvent) { reading = ReadingReducer.reduce(reading, event).0 }
        send(.recordingChanged(.on(elapsed: 62)))
        #expect(panelState(reading) == .init(recording: .on(elapsed: "00:01:02"), log: .liveTextOff(kept: nil)))
        send(.scrolled(atBottom: false))
        send(.textUpdated(readingText(.init(status: .listening, entries: [
            callEntry(.mine, 1, start: 1, settled: "settled", pending: " pending"),
            callEntry(.theirs, 1, start: 3, settled: "late", late: true),
        ]))))
        send(.hold(.init(entryID: 0, text: "held")))
        let holds = [PanelState.Held(entryID: 0, text: "held")]
        let expected = PanelState.Lines(rows: [
            .entry(.init(id: 0, time: "00:01", speaker: .me, settled: "settled", pending: " pending")),
            .late(.init(span: "00:03–00:04", entries: [.init(id: 1, time: "00:03", speaker: .them, settled: "late")])),
        ], holds: holds, newBelow: 2, followsLive: false)
        #expect(panelState(reading) == .init(recording: .on(elapsed: "00:01:02"), log: .lines(expected)))
        send(.textUpdated(.init(status: .off, entries: [])))
        #expect(panelState(reading).log == .liveTextOff(kept: expected))
        send(.textUpdated(.init(status: .gettingReady, entries: [])))
        #expect(panelState(reading).log == .preparing(holds: holds))
        send(.recordingChanged(.off))
        #expect(panelState(reading).recording == .off)
        for event in [PanelEvent.start, .stop, .switchLiveTextOn] { #expect(readingEvent(event) == nil) }
    }

    @Test func sessionConstructionConnectsItsTextAndEndsThePanel() async throws {

        let clock = ReadingClockSpy(), sink = ReadingLogSpy(), text = PanelCallTextSpy()
        let panel = AudelinPanel(now: clock.now, ticks: clock.ticks, sink: sink)
        var construction = SessionConstruction()
        construction.makeCallText = { _ in text }
        let starting = Signal(), release = Signal()
        defer { starting.end(); release.end() }
        try await withSessionRig(construction: construction, connect: { _, _ in Task {} }, beforeMicrophoneStartReturns: {
            starting.send()
            await release.next()
        }) { rig, _ in
            let sessions = RecordingSessions(makePieces: { _ in rig.pieces }, liveText: { false },
                                             report: { _, _ in }, connect: subscribe, sink: sink, panel: panel)
            let begin = Task { await sessions.begin(id: 11) }
            await starting.next()
            var preparing = await panel.states().makeAsyncIterator()
            #expect(await preparing.next()?.recording == .off)
            clock.advance(65)
            release.send()
            #expect(await begin.value == .ready)
            do {
                var states = await panel.states().makeAsyncIterator()
                _ = try await nextPanel(&states) { $0.recording == .on(elapsed: "00:00:00") }
                clock.advance(2)
                _ = try await nextPanel(&states) { $0.recording == .on(elapsed: "00:00:02") }
                text.input.continuation.yield(.init(status: .listening, entries: [callEntry(.theirs, 9, settled: "session text")]))
                let shown = try await nextPanel(&states) { $0.lines?.entries.first?.settled == "session text" }
                #expect(shown.lines?.entries.first?.speaker == .them)
                #expect(shown.recording == .on(elapsed: "00:00:02"))
                await sessions.end(id: 11)
                var ended = await panel.states().makeAsyncIterator()
                #expect(await ended.next() == .init(recording: .off, log: .empty))
            } catch {
                await sessions.end(id: 11)
                throw error
            }
        }
    }
}

private func callEntry(
    _ speaker: State.Speaker, _ id: Int, start: Double = 0,
    settled: String, pending: String = "", late: Bool = false
) -> State.Entry {

    .init(speaker: speaker, text: .init(id: id, start: start, end: start + 1, settled: settled, pending: pending), writtenLater: late)
}

private func withReading(
    _ panel: AudelinPanel, id: UInt64, text: AsyncStream<State>, body: () async throws -> Void
) async rethrows {

    let subscription = await panel.begin(id: id, text: text)
    subscription.recordingChanged(.on(elapsed: 0))
    for await state in await panel.states() {
        if state.recording == .on(elapsed: "00:00:00") { break }
    }
    do {
        try await body()
        await panel.end(id: id)
        await subscription.end()
    } catch {
        await panel.end(id: id)
        await subscription.end()
        throw error
    }
}

private func nextPanel(
    _ states: inout AsyncStream<PanelState>.Iterator, where matches: (PanelState) -> Bool
) async throws -> PanelState {

    while let state = await states.next() {
        if matches(state) { return state }
    }
    throw ScriptFailure.failed
}

private extension PanelState {

    var lines: Lines? { if case let .lines(lines) = log { lines } else { nil } }
}

final class ReadingClockSpy: Sendable {

    private let time = Mutex(100.0)
    private let outputs = Mutex<[AsyncStream<Void>.Continuation]>([])

    func panel() -> AudelinPanel {

        AudelinPanel(now: now, ticks: ticks, sink: ReadingLogSpy())
    }

    func now() -> Double { time.withLock { $0 } }

    func ticks() -> AsyncStream<Void> {

        let (stream, output) = AsyncStream<Void>.makeStream()
        outputs.withLock { $0.append(output) }
        return stream
    }

    func advance(_ seconds: Double) {

        time.withLock { $0 += seconds }
        for output in outputs.withLock({ $0 }) { output.yield(()) }
    }
}

private struct ReadingLogSpy: LogSink {

    let entries = Values<LogEntry>()
    func write(_ entry: LogEntry) { entries.append(entry) }
}

private final class PanelCallTextSpy: TranscriptWriting.CallText {

    let input = AsyncStream<State>.makeStream()
    var updates: AsyncStream<State> { input.stream }
    func start(enabled: Bool) async {}
    func setEnabled(_ enabled: Bool) async {}
    func stop() async { input.continuation.finish() }
}
