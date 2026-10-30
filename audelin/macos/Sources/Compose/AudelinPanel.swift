import struct CallText.State
import Foundation
import Observation
import PanelUI
import Reading
import Session

/// One recording's reading model as the panel uses it; the app makes it on the main actor.
public struct ReadingInputs: Sendable {

    let state: @MainActor @Sendable () -> ReadingState
    let send: @MainActor @Sendable (ReadingEvent) -> Void

    /// `state` must be observable, so the panel sees each change it reads.
    public init(state: @escaping @MainActor @Sendable () -> ReadingState, send: @escaping @MainActor @Sendable (ReadingEvent) -> Void) {

        self.state = state
        self.send = send
    }
}

/// The current recording's panel state and its reading actions.
public actor AudelinPanel {

    private let makeReading: @MainActor @Sendable () -> ReadingInputs
    private let now: @Sendable () -> Double
    private let ticks: @Sendable () -> AsyncStream<Void>
    private let sink: any LogSink
    private var current: (id: UInt64, reading: ReadingInputs, enableLiveText: @Sendable () async -> Void)?
    private var state = PanelState(recording: .off, log: .empty)
    private var subscribers: [UInt64: AsyncStream<PanelState>.Continuation] = [:]
    private var nextSubscriber: UInt64 = 0

    /// Each recording reads through a fresh model from `makeReading`.
    public init(makeReading: @escaping @MainActor @Sendable () -> ReadingInputs) {

        self.init(makeReading: makeReading, sink: SystemLogSink())
    }

    init(makeReading: @escaping @MainActor @Sendable () -> ReadingInputs, sink: any LogSink) {

        self.init(makeReading: makeReading, now: { ProcessInfo.processInfo.systemUptime }, ticks: readingSeconds, sink: sink)
    }

    init(
        makeReading: @escaping @MainActor @Sendable () -> ReadingInputs,
        now: @escaping @Sendable () -> Double, ticks: @escaping @Sendable () -> AsyncStream<Void>, sink: any LogSink
    ) {

        self.makeReading = makeReading
        self.now = now
        self.ticks = ticks
        self.sink = sink
    }

    /// Each subscriber immediately receives the current state.
    public func states() -> AsyncStream<PanelState> {

        let id = nextSubscriber
        nextSubscriber += 1
        let (stream, output) = AsyncStream<PanelState>.makeStream()
        output.yield(state)
        subscribers[id] = output
        output.onTermination = { [weak self] _ in Task { await self?.removeSubscriber(id) } }
        return stream
    }

    /// The menu wires recording controls; session controls and reading actions stay here.
    public func send(_ event: PanelEvent) async {

        if event == .switchLiveTextOn, let enableLiveText = current?.enableLiveText { await enableLiveText() }
        if let event = readingEvent(event), let reading = current?.reading { await reading.send(event) }
    }

    func begin(id: UInt64, text: AsyncStream<State>, enableLiveText: @escaping @Sendable () async -> Void) async -> ReadingSubscription {

        let reading = await makeReading()
        current = (id, reading, enableLiveText)
        return await ReadingSubscription(reading: reading, text: text, now: now, ticks: ticks(), sink: sink) { [weak self] state in
            await self?.receive(state, id: id)
        }
    }

    func end(id: UInt64) {

        guard current?.id == id else { return }
        current = nil
        publish(.init(recording: .off, log: .empty))
    }

    private func receive(_ state: ReadingState, id: UInt64) {

        guard current?.id == id else { return }
        publish(panelState(state))
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

    init(
        reading: ReadingInputs, text: AsyncStream<State>,
        now: @escaping @Sendable () -> Double, ticks: AsyncStream<Void>, sink: any LogSink,
        receive: @escaping @Sendable (ReadingState) async -> Void
    ) async {

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
        self.text = Task {
            for await state in text {
                guard !Task.isCancelled else { return }
                reading.send(.textUpdated(readingText(state)))
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

    func end() async {

        text.cancel()
        timer.cancel()
        await text.value
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

    func tick() {

        if let origin { reading.send(.recordingChanged(.on(elapsed: now() - origin))) }
    }
}

private func readingSeconds() -> AsyncStream<Void> {

    AsyncStream { output in
        let task = Task {
            let clock = ContinuousClock()
            var next = clock.now
            do {
                while true {
                    next += .seconds(1)
                    try await clock.sleep(until: next)
                    output.yield(())
                }
            } catch {}
            output.finish()
        }
        output.onTermination = { _ in task.cancel() }
    }
}
