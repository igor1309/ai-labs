import TimeoutNotice

/// The notice's waits, apart from host broadcast's countdowns, each keyed by its notice.
@MainActor final class NoticeTimer: TimeoutNotice.Timer {
    private let clock: any ClockPort
    private var waits: [TimeoutNotice.Notice: Task<Void, Never>] = [:]
    var send: (TimeoutNotice.Event) -> Void = { _ in }

    init(clock: any ClockPort) { self.clock = clock }
    deinit { for task in waits.values { task.cancel() } }

    func start(seconds: Int, for notice: TimeoutNotice.Notice) {
        stop(notice)
        let source = clock.countdown(from: seconds, every: .seconds(1))
        let send = send
        waits[notice] = Task.immediate { [weak self] in
            for await remaining in source where remaining == 0 {
                // Only reaching zero ends the wait; a stop ends the stream without it.
                guard !Task.isCancelled else { return }
                self?.waits[notice] = nil
                send(.elapsed(notice))
            }
        }
    }
    func stop(_ notice: TimeoutNotice.Notice) { waits.removeValue(forKey: notice)?.cancel() }
    func stop() {
        for task in waits.values { task.cancel() }
        waits.removeAll()
    }
}
