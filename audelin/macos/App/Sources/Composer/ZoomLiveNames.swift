import CallObservation
import SpeakerNaming
import ZoomAccessibility

/// Polls Zoom's "Talking" indicator during one recording and gives remote rows tentative
/// names. Off unless Accessibility is already granted; recording never depends on it.
actor ZoomLiveNames {

    /// The indicator lags speech and is polled; each interval edge is trusted only this far.
    static let uncertainty = 0.5
    static let interval = Duration.milliseconds(500)

    private let windows = ZoomWindows()
    private var observation = CallObservation()
    private var transitions = Transitions()
    private var live = LiveNames()
    private var sequence = 0
    private var known: [String] = []
    private var poll: Task<Void, Never>?

    /// `clock` gives call time in seconds, or nil before recording starts.
    func start(clock: @escaping @Sendable () async -> Double?) {

        guard poll == nil, windows.isPermitted else { return }
        poll = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                await self.read(clock: clock)
                try? await Task.sleep(for: Self.interval)
            }
        }
    }

    func stop() {

        poll?.cancel()
        poll = nil
    }

    private func read(clock: @Sendable () async -> Double?) async {

        guard let time = await clock() else { return }
        let reading = ZoomReading.read(windows: windows.windows())
        for change in transitions.next(reading) { receive(change, at: time) }
        observation.tick(now: time)
    }

    private func receive(_ change: Change, at time: Double) {

        func send(_ kind: Event.Kind) {
            sequence += 1
            observation.receive(.init(epoch: 1, sequence: sequence, time: time, kind: kind))
        }
        switch change {
        case let .started(name):
            // Zoom exposes display names only, so a name is the participant's identity.
            if !known.contains(name) {
                known.append(name)
                send(.roster(known.map { Member(id: $0, name: $0) }))
            }
            send(.speaking(memberID: name, true))
        case let .stopped(name): send(.speaking(memberID: name, false))
        case .observed: send(.heartbeat)
        case .lost: break
        }
    }

    /// Names for remote rows, keyed by the row's local ID; a given name never changes.
    func names(for rows: [(id: Int, start: Double, end: Double)]) -> [Int: String] {

        let snapshot = observation.snapshot
        let roster = snapshot.members.map { Participant(id: $0.id, name: $0.name, isLocal: $0.isLocal) }
        let activities = snapshot.intervals.map {
            Activity(participantID: $0.memberID, start: $0.start, end: $0.end, uncertainty: Self.uncertainty)
        }
        var result: [Int: String] = [:]
        for row in rows {
            if let name = live.name(row: String(row.id), start: row.start, end: row.end,
                                    roster: roster, activities: activities, through: snapshot.through) {
                result[row.id] = name
            }
        }
        return result
    }
}
