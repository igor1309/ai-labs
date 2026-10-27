import struct CallText.State
import Foundation
import Machine
import PanelUI
import Reading

/// The current recording's panel state and its reading actions.
public actor AudelinPanel {

    private let now: @Sendable () -> Double
    private let ticks: @Sendable () -> AsyncStream<Void>
    private let sink: any LogSink
    private var current: (id: UInt64, reading: ReadingMachine)?
    private var state = PanelState(recording: .off, log: .empty)
    private var subscribers: [UInt64: AsyncStream<PanelState>.Continuation] = [:]
    private var nextSubscriber: UInt64 = 0

    public init() {

        self.init(sink: SystemLogSink())
    }

    init(sink: any LogSink) {

        self.init(now: { ProcessInfo.processInfo.systemUptime }, ticks: readingSeconds, sink: sink)
    }

    init(now: @escaping @Sendable () -> Double, ticks: @escaping @Sendable () -> AsyncStream<Void>, sink: any LogSink) {

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

    /// Recording and live-text controls are connected separately from reading actions.
    public func send(_ event: PanelEvent) {

        if let event = readingEvent(event) { current?.reading.send(event) }
    }

    func begin(id: UInt64, text: AsyncStream<State>) async -> ReadingSubscription {

        let reading = ReadingReducer.machine()
        current = (id, reading)
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

typealias ReadingMachine = Machine<ReadingState, ReadingEvent, Never>

/// Owns only the subscriptions for one Session; no input is shared with a later one.
final class ReadingSubscription: Sendable {

    private let reading: ReadingMachine
    private let text: Task<Void, Never>
    private let timer: Task<Void, Never>
    private let observation: Task<Void, Never>

    init(
        reading: ReadingMachine, text: AsyncStream<State>,
        now: @escaping @Sendable () -> Double, ticks: AsyncStream<Void>, sink: any LogSink,
        receive: @escaping @Sendable (ReadingState) async -> Void
    ) async {

        self.reading = reading
        let start = now()
        reading.send(.recordingChanged(.on(elapsed: 0)))
        await receive(reading.snapshot())
        let states = await reading.states()
        observation = Task {
            for await state in states {
                StateLog(sink: sink).reading(state)
                await receive(state)
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
                reading.send(.recordingChanged(.on(elapsed: now() - start)))
            }
        }
    }

    func end() async {

        text.cancel()
        timer.cancel()
        await text.value
        await timer.value
        reading.send(.recordingChanged(.off))
        _ = await reading.snapshot()
        await reading.end()
        await observation.value
    }

    deinit {

        text.cancel()
        timer.cancel()
        observation.cancel()
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
