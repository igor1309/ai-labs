import Synchronization
@testable import MicrophoneCapture

final class FakeMicrophoneBinding: MicrophoneBinding, Sendable {

    struct State {
        var time = 0.0
        var input: UInt32 = 1
        var rate = 8.0
        var receive: (@Sendable (Result<InputBuffer, any Error>) -> Void)?
        var changed: (@Sendable () -> Void)?
        var defaultChanged: (@Sendable (UInt32) -> Void)?
        var timers: [Int: (Double, @Sendable () -> Void)] = [:]
        var nextTimer = 0
        var starts: [UInt32] = []
        var stops = 0
        var refuseStart = false
        var unavailableInputs: Set<UInt32> = []
        var refuseWatch = false
        var onStop: (@Sendable () -> Void)?
    }

    let state = Mutex(State())

    var now: Double { state.withLock { $0.time } }

    func defaultInput() throws -> UInt32 { state.withLock { $0.input } }

    func watchDefaultInput(_ changed: @escaping @Sendable (UInt32) -> Void) throws {

        try state.withLock {
            if $0.refuseWatch { throw Refusal() }
            $0.defaultChanged = changed
        }
    }

    func unwatchDefaultInput() {

        state.withLock { $0.defaultChanged = nil }
    }

    func start(
        input: UInt32,
        receive: @escaping @Sendable (Result<InputBuffer, any Error>) -> Void,
        configurationChanged: @escaping @Sendable () -> Void
    ) throws {

        try state.withLock {
            $0.starts.append(input)
            $0.receive = receive
            $0.changed = configurationChanged
            if $0.refuseStart || $0.unavailableInputs.contains(input) { throw Refusal() }
        }
    }

    func stop() {

        let onStop = state.withLock {
            let callback = $0.onStop
            $0.onStop = nil
            return callback
        }
        onStop?()
        state.withLock {
            $0.receive = nil
            $0.changed = nil
            $0.stops += 1
        }
    }

    func schedule(at deadline: Double, fire: @escaping @Sendable () -> Void) -> @Sendable () -> Void {

        let id = state.withLock {
            $0.nextTimer += 1
            $0.timers[$0.nextTimer] = (deadline, fire)
            return $0.nextTimer
        }
        return { [self] in state.withLock { $0.timers[id] = nil } }
    }

    func advance(_ seconds: Double) {

        let callbacks = state.withLock { state in
            state.time += seconds
            let due = state.timers.filter { $0.value.0 <= state.time }.sorted { $0.key < $1.key }
            for (id, _) in due { state.timers[id] = nil }
            return due.map { $0.value.1 }
        }
        for callback in callbacks { callback() }
    }

    func send(_ channels: [[Float]]) {

        let delivery = state.withLock {
            let buffer = InputBuffer(channels: channels, sampleRate: $0.rate, time: $0.time)
            $0.time += Double(channels.first?.count ?? 0) / $0.rate
            return ($0.receive, buffer)
        }
        delivery.0?(.success(delivery.1))
    }

    func configure(input: UInt32 = 2, rate: Double = 4) {

        let callback = state.withLock {
            $0.input = input
            $0.rate = rate
            return $0.changed
        }
        callback?()
    }

    func changeDefault(to input: UInt32) {

        let callback = state.withLock {
            $0.input = input
            return $0.defaultChanged
        }
        callback?(input)
    }
}

struct Refusal: Error, Equatable {}
