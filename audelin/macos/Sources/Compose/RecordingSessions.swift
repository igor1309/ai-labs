import Recording
import Session

/// Builds and observes the Session belonging to each Recording id.
public actor RecordingSessions: RecordingSession {

    private struct Running {

        let session: Task<SessionInputs, Never>
        let subscription: Task<Void, Never>
        // Each send waits for the one before it, so Session sees them in the order they were made.
        var sends: Task<Void, Never>?
        var observation: Task<Void, Never>?
        var reading: ReadingSubscription?
        var first: RecordingSessionReport?
        var beginners: [CheckedContinuation<RecordingSessionReport, Never>] = []
        var enders: [CheckedContinuation<Void, Never>] = []
        var started = false
        var endRequested = false
        var reportedFailure = false
        var faults: Set<RecordingFault> = []
        var reportedFaults: Set<RecordingFault> = []
        var callSilent = false
    }

    public nonisolated let panel: AudelinPanel
    private let makePieces: @Sendable (UInt64) -> SessionPieces
    private let liveText: @Sendable () -> Bool
    private let report: @Sendable (UInt64, RecordingSessionReport) -> Void
    private let connect: @Sendable (SessionPieces, SessionInputs) -> Task<Void, Never>
    private let makeSession: MakeSessionModel
    private let sink: any LogSink
    private var running: [UInt64: Running] = [:]
    // Recording's effects run independently, so an end can arrive before its begin.
    private var endedBeforeBegin: Set<UInt64> = []

    public init(
        makePieces: @escaping @Sendable (UInt64) -> SessionPieces,
        liveText: @escaping @Sendable () -> Bool,
        report: @escaping @Sendable (UInt64, RecordingSessionReport) -> Void,
        panel: AudelinPanel,
        makeSession: @escaping MakeSessionModel
    ) {

        self.init(
            makePieces: makePieces, liveText: liveText, report: report, connect: subscribe, sink: SystemLogSink(), panel: panel,
            makeSession: makeSession
        )
    }

    init(
        makePieces: @escaping @Sendable (UInt64) -> SessionPieces,
        liveText: @escaping @Sendable () -> Bool,
        report: @escaping @Sendable (UInt64, RecordingSessionReport) -> Void,
        connect: @escaping @Sendable (SessionPieces, SessionInputs) -> Task<Void, Never>,
        sink: any LogSink,
        panel: AudelinPanel,
        makeSession: @escaping MakeSessionModel
    ) {

        self.panel = panel
        self.makePieces = makePieces
        self.liveText = liveText
        self.report = report
        self.connect = connect
        self.sink = sink
        self.makeSession = makeSession
    }

    public func begin(id: UInt64) async -> RecordingSessionReport {

        if endedBeforeBegin.remove(id) != nil { return .ended }
        if running[id] == nil {
            let pieces = makePieces(id)
            let handler = pieces.handler(sink: sink)
            let session = Task { [makeSession] in await makeSession(handler) }
            let enabled = liveText()
            let connect = connect
            let subscription = Task {
                let forwarding = connect(pieces, await session.value)
                await withTaskCancellationHandler { await forwarding.value } onCancel: { forwarding.cancel() }
            }
            running[id] = Running(session: session, subscription: subscription)
            running[id]?.observation = Task {
                // Register before begin so even a short-lived state is retained.
                let states = await session.value.states()
                let text = await pieces.readingText()
                let reading = await self.panel.begin(id: id, text: text, enableLiveText: {
                    await self.send(.liveTextChanged(true), id: id)?.value
                })
                self.running[id]?.reading = reading
                self.start(id: id, liveText: enabled)
                var previous: ObservedSession?
                for await state in states {
                    let observed = ObservedSession(state)
                    guard observed != previous else { continue }
                    previous = observed
                    await reading.sessionChanged(state)
                    StateLog(sink: self.sink).session(state, id: id)
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
            if entry.started { send(.end, to: &entry) }
        }
        running[id] = entry
        await withCheckedContinuation { running[id]?.enders.append($0) }
    }

    private func start(id: UInt64, liveText: Bool) {

        guard var entry = running[id] else { return }
        send(.begin(liveText: liveText), to: &entry)
        entry.started = true
        if entry.endRequested { send(.end, to: &entry) }
        running[id] = entry
    }

    private func send(_ event: SessionEvent, id: UInt64) -> Task<Void, Never>? {

        guard var entry = running[id] else { return nil }
        send(event, to: &entry)
        running[id] = entry
        return entry.sends
    }

    private func send(_ event: SessionEvent, to entry: inout Running) {

        let previous = entry.sends, session = entry.session
        entry.sends = Task {
            await previous?.value
            await session.value.send(event)
        }
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
        entry.faults.formUnion(recordingFaults(state))
        if entry.first == .ready {
            let callSilent = state.audioWarning == .callSilent
            if callSilent != entry.callSilent {
                entry.callSilent = callSilent
                deliver(.callSilent(callSilent), id: id, entry: &entry)
            }
            for fault in RecordingFault.allCases where entry.faults.contains(fault) && entry.reportedFaults.insert(fault).inserted {
                deliver(.failed(fault), id: id, entry: &entry)
            }
        }
        if state.phase == .ended {
            if entry.first == nil || !entry.endRequested {
                deliver(.ended, id: id, entry: &entry)
            }
            let subscription = entry.subscription, observation = entry.observation, session = entry.session
            let sends = entry.sends, reading = entry.reading
            Task {
                await self.panel.end(id: id)
                await reading?.end()
                subscription.cancel()
                await subscription.value
                await sends?.value
                await session.value.end()
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

// Compare the fields read by the panel mapping, state log and report delivery.
// Session's private audio tracking can change for every measured window.
private struct ObservedSession: Equatable {

    let value: SessionState

    init(_ state: SessionState) {

        value = SessionState(
            health: state.health, wantedLiveText: state.wantedLiveText,
            liveTextRequestID: state.liveTextRequestID, pendingLiveText: state.pendingLiveText,
            phase: state.phase, liveText: state.liveText,
            folder: state.folder, processes: state.processes,
            microphoneTrack: state.microphoneTrack, callTrack: state.callTrack,
            microphoneCapture: state.microphoneCapture, callCapture: state.callCapture,
            transcript: state.transcript, callText: state.callText,
            failures: state.failures, cannotRecord: state.cannotRecord,
            audioWarning: state.audioWarning
        )
    }
}
