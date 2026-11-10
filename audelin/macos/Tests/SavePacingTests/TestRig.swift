import Synchronization
import SavePacing

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

/// Pauses between saves that last until the test ends them or the saver cancels them.
final class Pauses: Sendable {

    private struct State {
        var started = 0
        var cancelled = 0
        var waiting: CheckedContinuation<Void, Never>?
    }

    private let state = Mutex(State())
    private let changed: @Sendable () -> Void

    init(changed: @escaping @Sendable () -> Void) { self.changed = changed }

    var started: Int { state.withLock { $0.started } }
    var cancelled: Int { state.withLock { $0.cancelled } }
    var waiting: Bool { state.withLock { $0.waiting != nil } }

    func pause() async {

        await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                let resume = state.withLock { state in
                    state.started += 1
                    if Task.isCancelled { return true }
                    state.waiting = continuation
                    return false
                }
                changed()
                if resume { continuation.resume() }
            }
        } onCancel: {
            let waiting = state.withLock { state in
                state.cancelled += 1
                defer { state.waiting = nil }
                return state.waiting
            }
            waiting?.resume()
            changed()
        }
    }

    /// Ends the pause in progress.
    func end() {

        let waiting = state.withLock { state in
            defer { state.waiting = nil }
            return state.waiting
        }
        waiting?.resume()
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

struct SaveFailure: Error, Equatable {

    let message: String
}

final class FakeStore<Value: Hashable & Sendable>: Saving, Sendable {

    private struct State {
        var saves: [Value] = []
        var kept: Value?
    }

    private let state = Mutex(State())
    private let holds: [Value: Gate]
    private let failures: [Value: SaveFailure]
    private let changed: @Sendable () -> Void

    init(
        holds: [Value: Gate], failures: [Value: SaveFailure] = [:],
        changed: @escaping @Sendable () -> Void
    ) {

        self.holds = holds
        self.failures = failures
        self.changed = changed
    }

    var saves: [Value] { state.withLock { $0.saves } }
    var kept: Value? { state.withLock { $0.kept } }

    func save(_ value: Value) async throws {

        state.withLock { $0.saves.append(value) }
        changed()
        await holds[value]?.wait()
        if let failure = failures[value] { throw failure }
        state.withLock { $0.kept = value }
        changed()
    }
}

enum RunEvent: Equatable {

    case saveFailed(SaveFailure?)
    case finishReturned(Int)
}

final class Events: Sendable {

    private let events = Mutex<[RunEvent]>([])
    var recorded: [RunEvent] { events.withLock { $0 } }
    func record(_ event: RunEvent) { events.withLock { $0.append(event) } }
}

final class FakeFailureReport: FailureReport, Sendable {

    private let failures = Mutex<[SaveFailure?]>([])
    private let events: Events
    private let gate: Gate?
    private let changed: @Sendable () -> Void

    init(events: Events, gate: Gate?, changed: @escaping @Sendable () -> Void) {

        self.events = events
        self.gate = gate
        self.changed = changed
    }

    var recorded: [SaveFailure?] { failures.withLock { $0 } }

    func saveFailed(_ error: any Error) async {

        let failure = error as? SaveFailure
        failures.withLock { $0.append(failure) }
        events.record(.saveFailed(failure))
        changed()
        await gate?.wait()
    }
}

final class Completion: Sendable {

    private struct State {
        var started = false
        var stopped = false
    }

    private let state = Mutex(State())

    var started: Bool { state.withLock { $0.started } }
    var stopped: Bool { state.withLock { $0.stopped } }

    func didStart() { state.withLock { $0.started = true } }
    func didStop() { state.withLock { $0.stopped = true } }
}
