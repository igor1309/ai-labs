import Synchronization
import TranscriptWriting

final class Gate: Sendable {

    private struct State {
        var open = false
        var entered = false
        var waiting: [CheckedContinuation<Void, Never>] = []
    }

    private let state = Mutex(State())
    private let changed: @Sendable () -> Void

    init(changed: @escaping @Sendable () -> Void) { self.changed = changed }

    var entered: Bool { state.withLock { $0.entered } }

    func wait() async {

        await withCheckedContinuation { continuation in
            let resume = state.withLock {
                $0.entered = true
                if $0.open { return true }
                $0.waiting.append(continuation)
                return false
            }
            changed()
            if resume { continuation.resume() }
        }
    }

    func open() {

        let waiting = state.withLock {
            $0.open = true
            let waiting = $0.waiting
            $0.waiting.removeAll()
            return waiting
        }
        for continuation in waiting { continuation.resume() }
        changed()
    }
}

/// Wakes a waiting test each time a fake reports a change, so it can check what the fakes recorded.
final class Changes: Sendable {

    private struct State {
        var version = 0
        var waiters: [CheckedContinuation<Void, Never>] = []
    }

    private let state = Mutex(State())

    func notify() {

        let waiters = state.withLock { state in
            state.version += 1
            defer { state.waiters.removeAll() }
            return state.waiters
        }
        for waiter in waiters { waiter.resume() }
    }

    /// Returns once the condition holds, checking it after every change; a cancelled test stops waiting.
    func until(_ condition: () -> Bool) async {

        while !Task.isCancelled {
            let seen = state.withLock { $0.version }
            if condition() { return }
            await withTaskCancellationHandler {
                await withCheckedContinuation { continuation in
                    let resume = state.withLock {
                        if $0.version != seen || Task.isCancelled { return true }
                        $0.waiters.append(continuation)
                        return false
                    }
                    if resume { continuation.resume() }
                }
            } onCancel: {
                notify()
            }
        }
    }
}

final class FakeCallText<Text: Sendable>: CallText, Sendable {

    enum Call: Equatable {
        case subscribe, start(Bool), switchTo(Bool), stop
    }

    private let calls = Mutex<[Call]>([])
    private let source = AsyncStream<Text>.makeStream()
    private let startGate: Gate?
    private let stopGate: Gate?
    private let startText: Text?
    private let lastText: Text?
    private let switchText: @Sendable (Bool) -> Text
    private let changed: @Sendable () -> Void

    init(
        startGate: Gate?, stopGate: Gate?, startText: Text?, lastText: Text?,
        switchText: @escaping @Sendable (Bool) -> Text,
        changed: @escaping @Sendable () -> Void
    ) {

        self.startGate = startGate
        self.stopGate = stopGate
        self.startText = startText
        self.lastText = lastText
        self.switchText = switchText
        self.changed = changed
    }

    var recorded: [Call] { calls.withLock { $0 } }

    var updates: AsyncStream<Text> {
        record(.subscribe)
        return source.stream
    }

    func start(enabled: Bool) async {

        record(.start(enabled))
        if let startText { send(startText) }
        await startGate?.wait()
    }

    func setEnabled(_ enabled: Bool) async {

        record(.switchTo(enabled))
        send(switchText(enabled))
    }

    func stop() async {

        record(.stop)
        if let lastText { send(lastText) }
        source.continuation.finish()
        await stopGate?.wait()
    }

    func send(_ text: Text) { source.continuation.yield(text) }

    func finishUpdates() { source.continuation.finish() }

    private func record(_ call: Call) {

        calls.withLock { $0.append(call) }
        changed()
    }
}

struct WriteFailure: Error, Equatable {

    let message: String
}

enum RunEvent: Equatable {

    case transcriptFailed(WriteFailure?)
    case stopReturned(Int)
}

final class Events: Sendable {

    private let events = Mutex<[RunEvent]>([])
    var recorded: [RunEvent] { events.withLock { $0 } }
    func record(_ event: RunEvent) { events.withLock { $0.append(event) } }
}

final class FakeFailureReport: Sendable {

    private let failures = Mutex<[WriteFailure?]>([])
    private let events: Events
    private let gate: Gate?
    private let changed: @Sendable () -> Void

    init(events: Events, gate: Gate?, changed: @escaping @Sendable () -> Void) {

        self.events = events
        self.gate = gate
        self.changed = changed
    }

    var recorded: [WriteFailure?] { failures.withLock { $0 } }

    func transcriptFailed(_ error: any Error) async {

        let failure = error as? WriteFailure
        failures.withLock { $0.append(failure) }
        events.record(.transcriptFailed(failure))
        changed()
        await gate?.wait()
    }
}

/// Saves submitted texts in order; held saves never hold the immediate submission port.
final class FakeTextSaving<Text: Hashable & Sendable>: TextSaving, Sendable {

    private struct State {
        var writes: [Text] = []
        var kept: Text?
        var finishCalls = 0
    }

    private final class Storage: Sendable {
        let values = Mutex(State())
    }

    private let state: Storage
    private let pending: AsyncStream<Text>.Continuation
    private let worker: Task<Void, Never>
    private let finishGate: Gate?
    private let changed: @Sendable () -> Void

    init(
        holds: [Text: Gate], failures: [Text: WriteFailure], report: FakeFailureReport,
        finishGate: Gate?, changed: @escaping @Sendable () -> Void
    ) {

        let state = Storage()
        self.state = state
        self.finishGate = finishGate
        self.changed = changed
        let pending = AsyncStream<Text>.makeStream()
        self.pending = pending.continuation
        worker = Task {
            for await text in pending.stream {
                state.values.withLock { $0.writes.append(text) }
                changed()
                await holds[text]?.wait()
                if let failure = failures[text] {
                    await report.transcriptFailed(failure)
                } else {
                    state.values.withLock { $0.kept = text }
                    changed()
                }
            }
        }
    }

    var writes: [Text] { state.values.withLock { $0.writes } }
    var kept: Text? { state.values.withLock { $0.kept } }
    var finishCalls: Int { state.values.withLock { $0.finishCalls } }

    func submit(_ text: Text) { pending.yield(text) }

    func finish() async {

        state.values.withLock { $0.finishCalls += 1 }
        changed()
        pending.finish()
        await worker.value
        await finishGate?.wait()
    }

    deinit {
        pending.finish()
        worker.cancel()
    }
}

final class Observation<Text: Sendable>: Sendable {

    private struct State {
        var texts: [Text] = []
        var started = false
        var stopped = false
    }

    private let state = Mutex(State())

    var texts: [Text] { state.withLock { $0.texts } }
    var started: Bool { state.withLock { $0.started } }
    var stopped: Bool { state.withLock { $0.stopped } }

    func receive(_ text: Text) { state.withLock { $0.texts.append(text) } }
    func didStart() { state.withLock { $0.started = true } }
    func didStop() { state.withLock { $0.stopped = true } }
}

struct Run {

    let observed = Observation<String>()
    let events = Events()
    let report: FakeFailureReport
    let call: FakeCallText<String>
    let saving: FakeTextSaving<String>
    let subject: TranscriptWriting<String>
    let task: Task<Void, Never>
    private let commands = AsyncStream<Bool>.makeStream()

    init(
        changes: Changes, enabled: Bool, holds: [String: Gate],
        startGate: Gate? = nil, stopGate: Gate? = nil,
        startText: String? = nil, lastText: String? = nil,
        failures: [String: WriteFailure] = [:], reportGate: Gate? = nil,
        hasTranscript: Bool = true, finishGate: Gate? = nil
    ) {

        call = FakeCallText(
            startGate: startGate, stopGate: stopGate, startText: startText,
            lastText: lastText, switchText: { $0 ? "live text on" : "live text off" },
            changed: changes.notify
        )
        report = FakeFailureReport(events: events, gate: reportGate, changed: changes.notify)
        saving = FakeTextSaving(holds: holds, failures: failures, report: report, finishGate: finishGate, changed: changes.notify)
        subject = TranscriptWriting(callText: call, saving: hasTranscript ? saving : nil)
        task = Task { [commands, observed, subject, events] in
            let reader = Task {
                for await text in subject.updates {
                    observed.receive(text)
                    changes.notify()
                }
            }
            await subject.start(enabled: enabled)
            observed.didStart()
            changes.notify()
            for await enabled in commands.stream { await subject.setEnabled(enabled) }
            await subject.stop()
            events.record(.stopReturned(1))
            observed.didStop()
            changes.notify()
            await reader.value
        }
    }

    func setEnabled(_ enabled: Bool) { commands.continuation.yield(enabled) }
    func requestStop() { commands.continuation.finish() }
}
