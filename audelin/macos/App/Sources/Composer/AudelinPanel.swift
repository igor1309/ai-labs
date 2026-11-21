import CallNames
import Foundation
import IMRxObservation
import Observation
import PanelUI
import Reading
import Recording
import SpeakerNaming
import ZoomAccessibility

/// One recording's reading model as the panel uses it; the app makes it on the main actor.
struct ReadingInputs: Sendable {

    let state: @MainActor @Sendable () -> ReadingState
    let send: @MainActor @Sendable (ReadingEvent) -> Void

    /// `state` must be observable, so the panel sees each change it reads.
    init(state: @escaping @MainActor @Sendable () -> ReadingState, send: @escaping @MainActor @Sendable (ReadingEvent) -> Void) {

        self.state = state
        self.send = send
    }
}

/// The user's Zoom name: the one remembered, and remembering one Zoom showed.
struct ZoomName: Sendable {
    var read: @Sendable () -> String?
    var remember: @Sendable (String) -> Void
}

/// The current recording's panel state and its reading actions.
actor AudelinPanel {

    private let now: @Sendable () -> Double
    private let ticks: @Sendable () -> AsyncStream<Void>
    private let intervals: ProfileIntervals
    private let sink: any LogSink
    private let browser: @Sendable () -> BrowserChannel?
    private let sleep: @Sendable (Duration) async throws -> Void
    private let zoomName: ZoomName
    private var current: (id: UInt64, reading: ReadingInputs, enableLiveText: @Sendable () async -> Void)?
    private var subscription: (id: UInt64, value: ReadingSubscription)?
    /// The finished call's subscription, kept until the next recording so names confirmed
    /// after the call still reach its rows.
    private var finished: (id: UInt64, value: ReadingSubscription)?
    private var state = PanelState(recording: .off, log: .empty)
    private var mappedRows = MappedRows()
    private var panelText = PanelText(language: .russian)
    /// The reading state last mapped, so a new language can map it again.
    private var lastReading: ReadingState?
    private var subscribers: [UInt64: AsyncStream<PanelState>.Continuation] = [:]
    private var nextSubscriber: UInt64 = 0

    init(
        now: @escaping @Sendable () -> Double, ticks: @escaping @Sendable () -> AsyncStream<Void>, sink: any LogSink,
        intervals: ProfileIntervals, browser: @escaping @Sendable () -> BrowserChannel?,
        sleep: @escaping @Sendable (Duration) async throws -> Void, zoomName: ZoomName
    ) {

        self.zoomName = zoomName
        self.browser = browser
        self.sleep = sleep
        self.now = now
        self.ticks = ticks
        self.sink = sink
        self.intervals = intervals
    }

    /// Each subscriber immediately receives the current state.
    func states() -> AsyncStream<PanelState> {

        let id = nextSubscriber
        nextSubscriber += 1
        let (stream, output) = AsyncStream<PanelState>.makeStream()
        output.yield(state)
        subscribers[id] = output
        output.onTermination = { [weak self] _ in Task { await self?.removeSubscriber(id) } }
        return stream
    }

    /// The menu wires recording controls; session controls and reading actions stay here.
    func send(_ event: PanelEvent) async {

        if event == .switchLiveTextOn, let enableLiveText = current?.enableLiveText { await enableLiveText() }
        if let event = readingEvent(event), let reading = current?.reading { await reading.send(event) }
    }

    func begin(id: UInt64, text: AsyncStream<CallState>, speakers: AsyncStream<[Int: Int]> = AsyncStream { $0.finish() },
               names published: RecordingNames = RecordingNames(), enableLiveText: @escaping @Sendable () async -> Void) async -> ReadingSubscription {

        let reading = await makeReading()
        finished = nil
        current = (id, reading, enableLiveText)
        mappedRows = .init()
        lastReading = nil
        let update = SignpostedPanelUpdate(receive: { [weak self] state in
            await self?.receive(state, id: id)
        }, intervals: intervals)
        let made = await ReadingSubscription(reading: reading, text: text, speakers: speakers, names: published, now: now, ticks: ticks(), sink: sink,
                                              handler: callAppHandler()) { state in
            await update(state)
        }
        if current?.id == id { subscription = (id, made) }
        return made
    }

    private func callAppHandler() -> CallNamesEffectHandler {

        let windows = ZoomWindows()
        return CallNamesEffectHandler(
            zoom: ZoomCallObserver(isPermitted: { windows.isPermitted }, windows: { windows.windows() }, now: now,
                                   sleep: { try await Task.sleep(for: $0) }, knownName: zoomName.read, rememberName: zoomName.remember),
            browser: BrowserCallObserver(openBrowser: browser, monotonic: now, sleep: sleep, log: sink)
        )
    }

    /// Takes the recording's reading feed to its end first, so its last text and speakers are shown;
    /// the feed's streams must finish for this to return.
    func end(id: UInt64) async {

        guard current?.id == id else { return }
        if let subscription, subscription.id == id { await subscription.value.end() }
        guard current?.id == id else { return }
        current = nil
        finished = subscription
        subscription = nil
        // The finished call stays readable, with its confirmed names, until the next recording.
        publish(.init(recording: .off, log: state.log))
    }

    private func receive(_ state: ReadingState, id: UInt64) {

        if current?.id == id {
            lastReading = state
            publish(panelState(panelText.callAsFunction, state, rows: &mappedRows))
        } else if current == nil, finished?.id == id {
            lastReading = state
            publish(.init(recording: .off, log: panelState(panelText.callAsFunction, state, rows: &mappedRows).log))
        }
    }

    /// Maps what the panel shows again, from scratch, in the new language.
    func languageChanged(_ text: PanelText) {

        guard text != panelText else { return }
        panelText = text
        mappedRows = .init()
        guard let lastReading else { return }
        let next = panelState(panelText.callAsFunction, lastReading, rows: &mappedRows)
        publish(current == nil ? .init(recording: .off, log: next.log) : next)
    }

    private func publish(_ next: PanelState) {

        guard state != next else { return }
        state = next
        for output in subscribers.values { output.yield(next) }
    }

    private func removeSubscriber(_ id: UInt64) { subscribers[id] = nil }

    deinit {

        for output in subscribers.values { output.finish() }
    }
}

/// Owns only the subscriptions for one Session; no input is shared with a later one.
/// It runs on the main actor, where the reading model reduces, so the events it
/// sends keep their order.
@MainActor
final class ReadingSubscription {

    private let reading: ReadingInputs
    private let now: @Sendable () -> Double
    private let show: @MainActor @Sendable (ReadingState) async -> Void
    private let text: Task<Void, Never>
    private let timer: Task<Void, Never>
    /// Shows each new reading state; it ends with the last state it showed.
    private var observation: Task<ReadingState?, Never>
    private let names: ObservableModel<CallNamesState, CallNamesEvent, CallNamesEffect>
    private let naming: Task<Void, Never>
    private var ended = false

    init(
        reading: ReadingInputs, text: AsyncStream<CallState>, speakers: AsyncStream<[Int: Int]>, names recording: RecordingNames,
        now: @escaping @Sendable () -> Double, ticks: AsyncStream<Void>, sink: any LogSink,
        handler: CallNamesEffectHandler,
        receive: @escaping @Sendable (ReadingState) async -> Void
    ) async {

        self.reading = reading
        self.now = now
        let reducer = CallNamesReducer(
            name: { LiveNames().match(start: $0, end: $1, roster: $2, activities: $3, through: $4) },
            confirm: { rows, turns, evidence in
                AfterCallNames.names(rows: rows.map { ($0.id, $0.start, $0.end) }, turns: turns, evidence: evidence)
            })
        let names = ObservableModel(initialState: CallNamesState(), reduce: reducer.reduce, handleEffect: handler.handle)
        self.names = names
        let published = Observations { names.state }
        naming = Task {
            for await state in published {
                guard !Task.isCancelled else { return }
                recording.published(state)
                reading.send(.namesChanged(state.rowNames, confirmed: state.confirmed))
            }
        }
        let show: @MainActor @Sendable (ReadingState) async -> Void = { state in
            await receive(state)
            StateLog(sink: sink).reading(state)
        }
        self.show = show
        await receive(reading.state())
        observation = Self.observe(reading, after: nil, show: show)
        names.event(.start)
        self.text = Task {
            var mapped = 0
            for await state in text {
                guard !Task.isCancelled else { return }
                let remote = state.entries[mapped...].filter { $0.speaker != .mine }
                    .map { Row(id: $0.text.id, start: $0.text.start, end: $0.text.end) }
                if !remote.isEmpty { names.event(.rows(remote, now: now())) }
                reading.send(.textUpdated(readingText(state, from: mapped)))
                mapped = state.finalCount
            }
            // The speakers come after the call's last text, so every row they name is shown.
            for await places in speakers {
                guard !Task.isCancelled else { return }
                reading.send(.speakersFound(places))
            }
        }
        timer = Task {
            for await _ in ticks {
                guard !Task.isCancelled else { return }
                reading.send(.tick(at: now()))
            }
        }
        recording.connect { [weak self] turns, rows in await self?.diarized(turns, rows: rows) }
    }

    private func diarized(_ turns: [DiarizedTurn], rows: [Row]) { names.event(.diarized(turns, rows: rows)) }

    private func recordingChanged(_ recording: ReadingRecording, at instant: Double) {

        reading.send(.recordingChanged(recording, at: instant))
        names.event(.recordingChanged(isOn: recording == .on, at: instant))
    }

    func sessionChanged(_ state: SessionState) {

        let instant = now()
        recordingChanged(readingRecording(state), at: instant)
        reading.send(.problemsChanged(readingFaultKinds(state), callSilent: state.audioWarning == .callSilent, at: instant))
    }

    /// Waits for the text and speaker streams to finish, so every state they sent is reduced.
    func end() async {

        guard !ended else { return }
        ended = true
        names.event(.stop)
        for await state in Observations({ self.names.state }) where state.observation != .observing && state.observation != .stopping { break }
        await text.value
        timer.cancel()
        await timer.value
        recordingChanged(.off, at: now())
        // The model reduces the event later; wait until the state shows it.
        for await state in Observations({ self.reading.state() }) where state.recording == .off { break }
        observation.cancel()
        let shown = await observation.value
        let last = reading.state()
        if last != shown { await show(last) }
        // Names keep arriving after the call (the after-call pass confirms them); show each change.
        observation = Self.observe(reading, after: last, show: show)
    }

    /// Shows each reading state that differs from the one shown before it, starting after `shown`.
    private static func observe(
        _ reading: ReadingInputs, after shown: ReadingState?, show: @escaping @MainActor @Sendable (ReadingState) async -> Void
    ) -> Task<ReadingState?, Never> {

        let states = Observations { reading.state() }
        return Task {
            var shown = shown
            for await state in states where state != shown {
                guard !Task.isCancelled else { break }
                shown = state
                await show(state)
            }
            return shown
        }
    }

    isolated deinit {

        text.cancel()
        timer.cancel()
        observation.cancel()
        naming.cancel()
    }
}
