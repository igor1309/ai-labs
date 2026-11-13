import Foundation
import Observation
import PanelUI
import Reading
import Session

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

/// The current recording's panel state and its reading actions.
actor AudelinPanel {

    private let now: @Sendable () -> Double
    private let ticks: @Sendable () -> AsyncStream<Void>
    private let intervals: ProfileIntervals
    private let sink: any LogSink
    private let browser: @Sendable () -> BrowserChannel?
    private let sleep: @Sendable (Duration) async throws -> Void
    private var current: (id: UInt64, reading: ReadingInputs, enableLiveText: @Sendable () async -> Void)?
    private var subscription: (id: UInt64, value: ReadingSubscription)?
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
        sleep: @escaping @Sendable (Duration) async throws -> Void
    ) {

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
               enableLiveText: @escaping @Sendable () async -> Void) async -> ReadingSubscription {

        let reading = await makeReading()
        current = (id, reading, enableLiveText)
        mappedRows = .init()
        lastReading = nil
        let update = SignpostedPanelUpdate(receive: { [weak self] state in
            await self?.receive(state, id: id)
        }, intervals: intervals)
        let made = await ReadingSubscription(reading: reading, text: text, speakers: speakers, now: now, ticks: ticks(), sink: sink,
                                                  names: CallLiveNames(openBrowser: browser, monotonic: now, sleep: sleep)) { state in
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
        subscription = nil
        // The finished call stays readable, with its confirmed names, until the next recording.
        publish(.init(recording: .off, log: state.log))
    }

    private func receive(_ state: ReadingState, id: UInt64) {

        guard current?.id == id else { return }
        lastReading = state
        publish(panelState(panelText.callAsFunction, state, rows: &mappedRows))
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
    private let time: ReadingTime
    private let presenter: ReadingPresenter
    private let text: Task<Void, Never>
    private let timer: Task<Void, Never>
    private let observation: Task<Void, Never>
    private let names: CallLiveNames
    private var ended = false

    init(
        reading: ReadingInputs, text: AsyncStream<CallState>, speakers: AsyncStream<[Int: Int]>,
        now: @escaping @Sendable () -> Double, ticks: AsyncStream<Void>, sink: any LogSink, names: CallLiveNames,
        receive: @escaping @Sendable (ReadingState) async -> Void
    ) async {

        self.names = names
        self.reading = reading
        let time = ReadingTime(reading: reading, now: now)
        self.time = time
        let presenter = ReadingPresenter(sink: sink, receive: receive)
        self.presenter = presenter
        await receive(reading.state())
        let states = Observations { reading.state() }
        observation = Task {
            for await state in states {
                guard !Task.isCancelled else { return }
                await presenter.show(state)
            }
        }
        LiveNameBoard.shared.listen { names in await reading.send(.namesConfirmed(names)) }
        let names = self.names
        await names.start { await time.elapsed() }
        self.text = Task {
            var mapped = 0
            for await state in text {
                guard !Task.isCancelled else { return }
                let remote = state.entries[mapped...].filter { $0.speaker != .mine }
                    .map { (id: $0.text.id, start: $0.text.start, end: $0.text.end) }
                let given = remote.isEmpty ? [:] : await names.names(for: remote)
                reading.send(.textUpdated(readingText(state, from: mapped, names: given)))
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
                time.tick()
            }
        }
    }

    func recordingChanged(_ recording: ReadingRecording) {

        time.recordingChanged(recording)
    }

    func sessionChanged(_ state: SessionState) {

        time.recordingChanged(readingRecording(state))
        time.problemsChanged(readingFaultKinds(state), callSilent: state.audioWarning == .callSilent)
    }

    /// Waits for the text and speaker streams to finish, so every state they sent is reduced.
    func end() async {

        guard !ended else { return }
        ended = true
        await names.stop()
        await text.value
        timer.cancel()
        await timer.value
        time.recordingChanged(.off)
        // The model reduces the event later; wait until the state shows it.
        for await state in Observations({ self.reading.state() }) where state.recording == .off { break }
        observation.cancel()
        await observation.value
        await presenter.show(reading.state())
    }

    isolated deinit {

        text.cancel()
        timer.cancel()
        observation.cancel()
    }
}

/// Presents each distinct reading state once, in the order it was read.
@MainActor
private final class ReadingPresenter {

    private let sink: any LogSink
    private let receive: @Sendable (ReadingState) async -> Void
    private var shown: ReadingState?
    private var began = false

    init(sink: any LogSink, receive: @escaping @Sendable (ReadingState) async -> Void) {

        self.sink = sink
        self.receive = receive
    }

    func show(_ state: ReadingState) async {

        guard state != shown else { return }
        shown = state
        if case .on = state.recording { began = true }
        // Text starts before capture; retain it without presenting a running log yet.
        await receive(began ? state : .init())
        StateLog(sink: sink).reading(state)
    }
}

@MainActor
private final class ReadingTime {

    private let reading: ReadingInputs
    private let now: @Sendable () -> Double
    private var origin: Double?
    private var problems: [ReadingProblem] = []

    init(reading: ReadingInputs, now: @escaping @Sendable () -> Double) {

        self.reading = reading
        self.now = now
    }

    func recordingChanged(_ recording: ReadingRecording) {

        switch recording {
        case .off:
            origin = nil
            problems = []
            reading.send(.recordingChanged(.off))
        case let .on(elapsed):
            let instant = now()
            let beginning = origin ?? instant - elapsed
            origin = beginning
            reading.send(.recordingChanged(.on(elapsed: instant - beginning)))
        }
    }

    func problemsChanged(_ kinds: [ReadingProblem.Kind], callSilent: Bool) {

        guard let origin else { return }
        problems.removeAll { $0.kind == .callSilent && !callSilent }
        let active = kinds + (callSilent ? [.callSilent] : [])
        let elapsed = now() - origin
        for kind in active where !problems.contains(where: { $0.kind == kind }) {
            problems.append(.init(kind, began: elapsed))
        }
        reading.send(.problemsChanged(problems))
    }

    /// Seconds since the recording began, or nil while it is off.
    func elapsed() -> Double? { origin.map { now() - $0 } }

    func tick() {

        if let origin { reading.send(.recordingChanged(.on(elapsed: now() - origin))) }
    }
}
