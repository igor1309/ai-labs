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

/// Drains runnable work before assertions about work still held by a fake.
final class TestExecutor: TaskExecutor {

    private let jobs = Mutex<[UnownedJob]>([])
    private let events = AsyncStream<Void>.makeStream()
    private let completed = Mutex(false)

    func notify() { events.continuation.yield(()) }

    func enqueue(_ job: consuming ExecutorJob) {

        let job = UnownedJob(job)
        jobs.withLock { $0.append(job) }
        notify()
    }

    func complete() {

        completed.withLock { $0 = true }
        events.continuation.finish()
    }

    func run() {

        while let job = jobs.withLock({ $0.isEmpty ? nil : $0.removeFirst() }) {
            job.runSynchronously(on: asUnownedTaskExecutor())
        }
    }

    func run(until condition: () -> Bool) async {

        var iterator = events.stream.makeAsyncIterator()
        while !condition() && !completed.withLock({ $0 }) {
            run()
            if !condition(), await iterator.next() == nil { break }
        }
        run()
    }

    func finish() async {

        for await _ in events.stream { run() }
        run()
    }
}

final class FakeCallText: CallText, Sendable {

    enum Call: Equatable {
        case subscribe, start(Bool), switchTo(Bool), stop
    }

    private let calls = Mutex<[Call]>([])
    private let source = AsyncStream<String>.makeStream()
    private let startGate: Gate?
    private let stopGate: Gate?
    private let startText: String?
    private let lastText: String?
    private let changed: @Sendable () -> Void

    init(
        startGate: Gate?, stopGate: Gate?, startText: String?, lastText: String?,
        changed: @escaping @Sendable () -> Void
    ) {

        self.startGate = startGate
        self.stopGate = stopGate
        self.startText = startText
        self.lastText = lastText
        self.changed = changed
    }

    var recorded: [Call] { calls.withLock { $0 } }

    var updates: AsyncStream<String> {
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
        send(enabled ? "live text on" : "live text off")
    }

    func stop() async {

        record(.stop)
        if let lastText { send(lastText) }
        source.continuation.finish()
        await stopGate?.wait()
    }

    func send(_ text: String) { source.continuation.yield(text) }

    private func record(_ call: Call) {

        calls.withLock { $0.append(call) }
        changed()
    }
}

final class FakeTranscript: Transcript, Sendable {

    private struct State {
        var writes: [String] = []
        var kept: String?
    }

    private let state = Mutex(State())
    private let holds: [String: Gate]
    private let changed: @Sendable () -> Void

    init(holds: [String: Gate], changed: @escaping @Sendable () -> Void) {

        self.holds = holds
        self.changed = changed
    }

    var writes: [String] { state.withLock { $0.writes } }
    var kept: String? { state.withLock { $0.kept } }

    func write(_ text: String) async throws {

        state.withLock { $0.writes.append(text) }
        changed()
        await holds[text]?.wait()
        state.withLock { $0.kept = text }
        changed()
    }
}

final class FakeFailureReport: FailureReport, Sendable {

    private let failures = Mutex<[String]>([])
    var recorded: [String] { failures.withLock { $0 } }

    func transcriptFailed(_ error: any Error) async {

        failures.withLock { $0.append(String(describing: error)) }
    }
}

final class Observation: Sendable {

    private struct State {
        var texts: [String] = []
        var started = false
        var stopped = false
    }

    private let state = Mutex(State())

    var texts: [String] { state.withLock { $0.texts } }
    var started: Bool { state.withLock { $0.started } }
    var stopped: Bool { state.withLock { $0.stopped } }

    func receive(_ text: String) { state.withLock { $0.texts.append(text) } }
    func didStart() { state.withLock { $0.started = true } }
    func didStop() { state.withLock { $0.stopped = true } }
}

struct Run {

    let observed = Observation()
    let report = FakeFailureReport()
    let call: FakeCallText
    let transcript: FakeTranscript
    let task: Task<Void, Never>
    private let commands = AsyncStream<Bool>.makeStream()

    init(
        executor: TestExecutor, enabled: Bool, holds: [String: Gate],
        startGate: Gate? = nil, stopGate: Gate? = nil,
        startText: String? = nil, lastText: String? = nil
    ) {

        call = FakeCallText(
            startGate: startGate, stopGate: stopGate, startText: startText,
            lastText: lastText, changed: executor.notify
        )
        transcript = FakeTranscript(holds: holds, changed: executor.notify)
        let subject = TranscriptWriting(callText: call, transcript: transcript, failureReport: report)
        task = Task(executorPreference: executor) { [commands, observed] in
            let reader = Task {
                for await text in subject.updates {
                    observed.receive(text)
                    executor.notify()
                }
            }
            await subject.start(enabled: enabled)
            observed.didStart()
            executor.notify()
            for await enabled in commands.stream { await subject.setEnabled(enabled) }
            await subject.stop()
            observed.didStop()
            executor.notify()
            await reader.value
            executor.complete()
        }
    }

    func setEnabled(_ enabled: Bool) { commands.continuation.yield(enabled) }
    func requestStop() { commands.continuation.finish() }
}
