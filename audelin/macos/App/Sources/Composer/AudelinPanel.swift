import CallNames
import Foundation
import IMRxObservation
import PanelUI
import Reading
import Recording
import ZoomAccessibility

/// The user's Zoom name: the one remembered, and remembering one Zoom showed.
struct ZoomName: Sendable {
    var read: @Sendable () -> String?
    var remember: @Sendable (String) -> Void
}

/// The panel and the call that produced it travel together to the view's event binding.
struct PanelPresentation: Equatable, Sendable {
    var call: UInt64?
    var state = PanelState(recording: .off, log: .empty)
}

/// Connects an app-lifetime Reading to the panel and each call's feeds.
@MainActor
final class AudelinPanel {

    private struct Subscription {
        let inputs: Task<Void, Never>
        let timer: Task<Void, Never>
    }

    private let now: @Sendable () -> Double
    private let ticks: @Sendable () -> AsyncStream<Void>
    private let intervals: ProfileIntervals
    private let sink: any LogSink
    let names: ApplicationCallNames
    private let reading: SyncModel<ReadingState, ReadingEvent>
    private let feed = StateFeed<PanelPresentation>()
    private let statesFeed = StateFeed<PanelState>()
    private var presentation = PanelPresentation()
    private var mappedRows = MappedRows()
    private var panelText = PanelText(language: .russian)
    private var subscriptions: [UInt64: Subscription] = [:]

    init(
        now: @escaping @Sendable () -> Double, ticks: @escaping @Sendable () -> AsyncStream<Void>, sink: any LogSink,
        intervals: ProfileIntervals, names: ApplicationCallNames
    ) {
        self.names = names
        self.now = now
        self.ticks = ticks
        self.sink = sink
        self.intervals = intervals
        self.reading = makeReading()
    }

    func states() -> AsyncStream<PanelState> { statesFeed.subscribe(from: presentation.state) }

    func presentations() -> AsyncStream<PanelPresentation> { feed.subscribe(from: presentation) }

    func send(_ event: PanelEvent, for id: UInt64) {
        if let update = readingEvent(event) { send(.update(id, update)) }
    }

    func begin(id: UInt64, text: AsyncStream<CallState>, speakers: AsyncStream<[Int: Int]> = AsyncStream { $0.finish() },
               names published: RecordingNames = RecordingNames()) {

        send(.opened(id))
        names.open(id: id, published: published)
        let nameStates = published.states()
        let ticks = ticks()
        let timer = Task { [weak self, now] in
            for await _ in ticks {
                guard let self else { return }
                send(.update(id, .tick(at: now())))
            }
        }
        let inputs = Task { [weak self] in
            await withTaskGroup(of: Void.self) { group in
                group.addTask { [weak self] in
                    var mapped = 0
                    for await state in text {
                        guard !Task.isCancelled, let self else { return }
                        await self.receiveText(state, from: mapped, id: id)
                        mapped = state.finalCount
                    }
                    await self?.send(.update(id, .textEnded))
                }
                group.addTask { [weak self] in
                    for await places in speakers {
                        guard let self else { return }
                        await self.send(.update(id, .speakersFound(places)))
                    }
                }
                group.addTask { [weak self] in
                    var previous: CallNamesState?
                    for await names in nameStates {
                        guard let self else { return }
                        if names.rowNames != previous?.rowNames || names.confirmed != previous?.confirmed {
                            await self.send(.update(id, .namesChanged(names.rowNames, confirmed: names.confirmed)))
                        }
                        previous = names
                    }
                }
            }
            self?.subscriptions.removeValue(forKey: id)?.timer.cancel()
            self?.send(.update(id, .feedsEnded))
        }
        subscriptions[id] = Subscription(inputs: inputs, timer: timer)
    }

    func sessionChanged(id: UInt64, _ state: SessionState, after phase: SessionState.Phase? = nil, at instant: Double) {
        if phase != state.phase {
            names.sessionChanged(id: id, phase: state.phase, hasTranscript: state.transcript != .down, at: instant)
        }
        send(.update(id, .recordingChanged(readingRecording(state), at: instant)))
        send(.update(id, .problemsChanged(readingFaultKinds(state), callSilent: state.audioWarning == .callSilent, at: instant)))
        if state.phase == .ended {
            subscriptions[id]?.timer.cancel()
            send(.update(id, .sessionEnded))
        }
    }

    private func receiveText(_ state: CallState, from cursor: Int, id: UInt64) {
        let remote = state.entries[cursor...].filter { $0.speaker != .mine }
            .map { Row(id: $0.text.id, start: $0.text.start, end: $0.text.end) }
        if !remote.isEmpty { names.send(.update(id, .rows(remote, now: now()))) }
        send(.update(id, .textUpdated(readingText(state, from: cursor))))
    }

    private func send(_ event: ReadingEvent) {
        let previous = reading.state
        reading.event(event)
        let state = reading.state
        guard state != previous else { return }
        publish(state)
        StateLog(sink: sink).reading(state)
    }

    /// Maps the displayed log again in the chosen language, including a finished call.
    func languageChanged(_ text: PanelText) {
        guard text != panelText else { return }
        panelText = text
        mappedRows = .init()
        publish(reading.state)
    }

    private func publish(_ state: ReadingState) {
        SignpostedPanelUpdate(receive: present, intervals: intervals)(state)
    }

    private func present(_ state: ReadingState) {
        let next = PanelPresentation(call: state.displayedCall, state: panelState(panelText.callAsFunction, state, rows: &mappedRows))
        guard next != presentation else { return }
        let stateChanged = next.state != presentation.state
        presentation = next
        feed.publish(next)
        if stateChanged { statesFeed.publish(next.state) }
    }

    isolated deinit {
        for subscription in subscriptions.values {
            subscription.inputs.cancel()
            subscription.timer.cancel()
        }
        feed.finish()
        statesFeed.finish()
    }
}

@MainActor
func makeAudelinPanel(
    now: @escaping @Sendable () -> Double, ticks: @escaping @Sendable () -> AsyncStream<Void>, sink: any LogSink,
    intervals: ProfileIntervals, browser: @escaping @Sendable () -> BrowserChannel?,
    sleep: @escaping @Sendable (Duration) async throws -> Void, zoomName: ZoomName
) -> AudelinPanel {
    let names = ApplicationCallNames(now: now) { clock in
        let windows = ZoomWindows()
        return CallAppWatch(sources: [
            ZoomCallObserver(isPermitted: { windows.isPermitted }, windows: { windows.windows() }, clock: clock,
                             sleep: { try await Task.sleep(for: $0) }, knownName: zoomName.read, rememberName: zoomName.remember),
            BrowserCallObserver(openBrowser: browser, clock: clock, monotonic: now, sleep: sleep, log: sink),
        ])
    }
    return AudelinPanel(now: now, ticks: ticks, sink: sink, intervals: intervals, names: names)
}
