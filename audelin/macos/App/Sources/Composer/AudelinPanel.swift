import CallNames
import Foundation
import IMRxObservation
import Observation
import PanelUI
import Reading
import Recording
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
    nonisolated let names: ApplicationCallNames
    private let buildReading: @MainActor @Sendable () async -> ReadingInputs
    private var current: (id: UInt64, reading: ReadingInputs, enableLiveText: @Sendable () async -> Void)?
    private var opening: UInt64?
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

    @MainActor init(
        now: @escaping @Sendable () -> Double, ticks: @escaping @Sendable () -> AsyncStream<Void>, sink: any LogSink,
        intervals: ProfileIntervals, browser: @escaping @Sendable () -> BrowserChannel?,
        sleep: @escaping @Sendable (Duration) async throws -> Void, zoomName: ZoomName,
        buildReading: @escaping @MainActor @Sendable () async -> ReadingInputs = { makeReading() }
    ) {

        let sharedBrowser = SharedBrowserObservations(open: browser, monotonic: now, sleep: sleep, log: sink)
        self.names = ApplicationCallNames(now: now) { clock in
            let windows = ZoomWindows()
            return CallAppWatch(sources: [
                ZoomCallObserver(isPermitted: { windows.isPermitted }, windows: { windows.windows() }, clock: clock,
                                 sleep: { try await Task.sleep(for: $0) }, knownName: zoomName.read, rememberName: zoomName.remember),
                BrowserCallObserver(browser: sharedBrowser, clock: clock, monotonic: now, log: sink),
            ])
        }
        self.now = now
        self.ticks = ticks
        self.sink = sink
        self.intervals = intervals
        self.buildReading = buildReading
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
               names published: RecordingNames = RecordingNames(), canWatch: @escaping @MainActor @Sendable () -> Bool = { true },
               enableLiveText: @escaping @Sendable () async -> Void) async -> ReadingSubscription {

        opening = max(opening ?? id, id)
        let reading = await buildReading()
        if opening == id {
            finished = nil
            current = (id, reading, enableLiveText)
            mappedRows = .init()
            lastReading = nil
        }
        let update = SignpostedPanelUpdate(receive: { [weak self] state in
            await self?.receive(state, id: id)
        }, intervals: intervals)
        let made = await ReadingSubscription(id: id, reading: reading, text: text, speakers: speakers,
                                              names: names, published: published, canWatch: canWatch,
                                              now: now, ticks: ticks(), sink: sink) { state in
            await update(state)
        }
        if current?.id == id { subscription = (id, made) }
        return made
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
    private let naming: Task<Void, Never>
    /// Shows each new reading state; it ends with the last state it showed.
    private var observation: Task<ReadingState?, Never>
    private let id: UInt64
    private let names: ApplicationCallNames
    private var ended = false

    init(
        id: UInt64, reading: ReadingInputs, text: AsyncStream<CallState>, speakers: AsyncStream<[Int: Int]>,
        names: ApplicationCallNames, published: RecordingNames, canWatch: @MainActor @Sendable () -> Bool,
        now: @escaping @Sendable () -> Double,
        ticks: AsyncStream<Void>, sink: any LogSink, receive: @escaping @Sendable (ReadingState) async -> Void
    ) async {

        self.id = id
        self.names = names
        self.reading = reading
        self.now = now
        let show: @MainActor @Sendable (ReadingState) async -> Void = { state in
            await receive(state)
            StateLog(sink: sink).reading(state)
        }
        self.show = show
        await receive(reading.state())
        // Session can reach its terminal phase while the panel is still opening.
        if canWatch() { names.open(id: id, published: published) }
        else { published.finish() }
        let changes = published.states()
        naming = Task {
            var previous: CallNamesState?
            for await names in changes {
                if names.rowNames != previous?.rowNames || names.confirmed != previous?.confirmed {
                    reading.send(.namesChanged(names.rowNames, confirmed: names.confirmed))
                }
                previous = names
            }
        }
        observation = Self.observe(reading, after: nil, show: show)
        self.text = Task {
            var mapped = 0
            for await state in text {
                guard !Task.isCancelled else { return }
                let remote = state.entries[mapped...].filter { $0.speaker != .mine }
                    .map { Row(id: $0.text.id, start: $0.text.start, end: $0.text.end) }
                if !remote.isEmpty { names.send(.update(id, .rows(remote, now: now()))) }
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
    }

    func sessionChanged(_ state: SessionState, at instant: Double) {

        reading.send(.recordingChanged(readingRecording(state), at: instant))
        reading.send(.problemsChanged(readingFaultKinds(state), callSilent: state.audioWarning == .callSilent, at: instant))
    }

    /// Waits for the text and speaker streams to finish, so every state they sent is reduced.
    func end() async {

        guard !ended else { return }
        ended = true
        names.send(.stop(id))
        for await observation in Observations({ self.names.observation(of: self.id) })
        where observation != .observing && observation != .stopping { break }
        await text.value
        timer.cancel()
        await timer.value
        let instant = now()
        reading.send(.recordingChanged(.off, at: instant))
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
        naming.cancel()
        observation.cancel()
    }
}
