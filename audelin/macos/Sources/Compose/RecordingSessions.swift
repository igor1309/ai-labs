import Recording
import Session

/// Builds and observes the Session belonging to each Recording id.
public actor RecordingSessions: RecordingSession {

    private struct Running {

        let session: Session
        let subscription: Task<Void, Never>
        var observation: Task<Void, Never>?
        var first: RecordingSessionReport?
        var beginners: [CheckedContinuation<RecordingSessionReport, Never>] = []
        var enders: [CheckedContinuation<Void, Never>] = []
        var started = false
        var endRequested = false
        var reportedFailure = false
    }

    private let makePieces: @Sendable (UInt64) -> SessionPieces
    private let liveText: @Sendable () -> Bool
    private let report: @Sendable (UInt64, RecordingSessionReport) -> Void
    private let connect: @Sendable (SessionPieces, Session) -> Task<Void, Never>
    private var running: [UInt64: Running] = [:]
    // Recording's effects run independently, so an end can arrive before its begin.
    private var endedBeforeBegin: Set<UInt64> = []

    public init(
        makePieces: @escaping @Sendable (UInt64) -> SessionPieces,
        liveText: @escaping @Sendable () -> Bool,
        report: @escaping @Sendable (UInt64, RecordingSessionReport) -> Void
    ) {

        self.init(makePieces: makePieces, liveText: liveText, report: report, connect: subscribe)
    }

    init(
        makePieces: @escaping @Sendable (UInt64) -> SessionPieces,
        liveText: @escaping @Sendable () -> Bool,
        report: @escaping @Sendable (UInt64, RecordingSessionReport) -> Void,
        connect: @escaping @Sendable (SessionPieces, Session) -> Task<Void, Never>
    ) {

        self.makePieces = makePieces
        self.liveText = liveText
        self.report = report
        self.connect = connect
    }

    public func begin(id: UInt64) async -> RecordingSessionReport {

        if endedBeforeBegin.remove(id) != nil { return .ended }
        if running[id] == nil {
            let pieces = makePieces(id)
            let session = Session(handler: pieces.handler())
            let enabled = liveText()
            running[id] = Running(session: session, subscription: connect(pieces, session))
            running[id]?.observation = Task {
                // Register before begin so even a short-lived state is retained.
                let states = await session.states()
                self.start(id: id, liveText: enabled)
                for await state in states {
                    if self.receive(state, id: id) { return }
                }
            }
        }
        return await withCheckedContinuation { answer in
            if let first = running[id]?.first { answer.resume(returning: first) }
            else { running[id]?.beginners.append(answer) }
        }
    }

    public func end(id: UInt64) async {

        guard var entry = running[id] else {
            endedBeforeBegin.insert(id)
            return
        }
        if !entry.endRequested {
            entry.endRequested = true
            if entry.started { entry.session.send(.end) }
        }
        running[id] = entry
        await withCheckedContinuation { running[id]?.enders.append($0) }
    }

    private func start(id: UInt64, liveText: Bool) {

        guard var entry = running[id] else { return }
        entry.session.send(.begin(liveText: liveText))
        entry.started = true
        if entry.endRequested { entry.session.send(.end) }
        running[id] = entry
    }

    private func receive(_ state: SessionState, id: UInt64) -> Bool {

        guard var entry = running[id] else { return true }
        if let reason = state.cannotRecord, !entry.reportedFailure {
            entry.reportedFailure = true
            deliver(.cannotRecord(reason), id: id, entry: &entry)
        }
        if state.phase == .recording, entry.first == nil {
            deliver(.ready, id: id, entry: &entry)
        }
        if state.phase == .ended {
            if entry.first == nil || !entry.endRequested {
                deliver(.ended, id: id, entry: &entry)
            }
            let subscription = entry.subscription, observation = entry.observation, session = entry.session
            Task {
                subscription.cancel()
                await subscription.value
                await session.end()
                await observation?.value
                self.forget(id: id)
            }
        }
        running[id] = entry
        return state.phase == .ended
    }

    private func deliver(_ value: RecordingSessionReport, id: UInt64, entry: inout Running) {

        if entry.first == nil {
            entry.first = value
            for answer in entry.beginners { answer.resume(returning: value) }
            entry.beginners.removeAll()
        } else {
            report(id, value)
        }
    }

    private func forget(id: UInt64) {

        guard let entry = running.removeValue(forKey: id) else { return }
        for answer in entry.enders { answer.resume() }
    }
}
