import Preferences
import CoreAudioProcesses
import Calls
import Foundation
import Recording
import Session

/// Builds and observes the Session belonging to each Recording id.
actor RecordingSessions: RecordingSession {

    private struct Running {

        let session: SessionInputs
        let subscription: Task<Void, Never>
        let pieces: SessionPieces
        var observation: Task<Void, Never>?
        var first: RecordingSessionReport?
        var beginners: [CheckedContinuation<RecordingSessionReport, Never>] = []
        var enders: [CheckedContinuation<Void, Never>] = []
        var started = false
        var endRequested = false
        var announcedEnding = false
    }

    nonisolated let panel: AudelinPanel
    private let makePieces: @Sendable (UInt64) -> SessionPieces
    private let liveText: @Sendable () -> Bool
    private let report: @Sendable (UInt64, RecordingSessionReport) async -> Void
    private let status: @Sendable (UInt64, RecordingSessionStatus) async -> Void
    private let summaries: SummaryCallbacks
    private let timeZone: @Sendable () -> TimeZone
    private let sink: any LogSink
    private var running: [UInt64: Running] = [:]
    // Recording's effects run independently, so an end can arrive before its begin.
    private var endedBeforeBegin: Set<UInt64> = []

    init(
        preferences: PreferencesStore, occupiedCallNames: @escaping @Sendable () throws -> [String],
        callApp: RecordingCallApp, processes: CoreAudioProcesses,
        boundary: ComposerBoundary,
        report: @escaping @Sendable (UInt64, RecordingSessionReport) async -> Void,
        status: @escaping @Sendable (UInt64, RecordingSessionStatus) async -> Void,
        panel: AudelinPanel, finalization: TranscriptFinalizationModel, finalizationResources: FinalizationResources, summaries: SummaryCallbacks = .disabled
    ) {
        self.timeZone = boundary.time.timeZone
        self.panel = panel
        self.makePieces = composeRecordingPieces(preferences: preferences, occupiedCallNames: occupiedCallNames, callApp: callApp,
                                                 processes: processes, boundary: boundary, finalization: finalization, finalizationResources: finalizationResources)
        self.summaries = summaries
        self.liveText = { preferences.read().liveText }
        self.report = report
        self.status = status
        self.sink = boundary.log
    }

    func begin(id: UInt64) async -> RecordingSessionReport {

        if endedBeforeBegin.remove(id) != nil { return .ended }
        if running[id] == nil {
            let pieces = makePieces(id)
            let handler = pieces.handler()
            let session = makeSession(handler: handler)
            let enabled = liveText()
            let subscription = Task {
                let forwarding = subscribe(pieces, to: session)
                await withTaskCancellationHandler { await forwarding.value } onCancel: { forwarding.cancel() }
            }
            running[id] = Running(session: session, subscription: subscription, pieces: pieces)
            running[id]?.observation = Task {
                // Register before begin so even a short-lived state is retained.
                let states = await session.states()
                let feed = await pieces.readingText()
                let reading = await self.panel.begin(id: id, text: feed.text, speakers: feed.speakers, names: pieces.names, enableLiveText: {
                    await self.send(.liveTextChanged(true), id: id)
                })
                self.start(id: id, liveText: enabled)
                var previous: ObservedSession?
                for await state in states {
                    let observed = ObservedSession(state)
                    guard observed != previous else { continue }
                    previous = observed
                    await reading.sessionChanged(state)
                    StateLog(sink: self.sink).session(state, id: id)
                    if await self.receive(state, id: id) { return }
                }
            }
        }
        return await withCheckedContinuation { answer in
            if let first = running[id]?.first { answer.resume(returning: first) }
            else { running[id]?.beginners.append(answer) }
        }
    }

    func end(id: UInt64) async {

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

    private func send(_ event: SessionEvent, id: UInt64) {

        running[id]?.session.send(event)
    }

    private func send(_ event: SessionEvent, to entry: inout Running) {

        entry.session.send(event)
    }

    private func receive(_ state: SessionState, id: UInt64) async -> Bool {

        await status(id, RecordingSessionStatus(
            callID: state.recordedFolder.flatMap { Calls.id(in: URL(fileURLWithPath: $0.id).lastPathComponent, timeZone: timeZone()) },
            recording: state.phase == .recording, cannotRecord: state.cannotRecord,
            faults: recordingFaults(state), callSilent: state.audioWarning == .callSilent
        ))
        // Notes show the call as waiting once its text stops; a later finalized transcript supersedes this.
        if state.callText == .stopping || state.callText == .closed, let folder = state.recordedFolder, running[id]?.announcedEnding == false {
            running[id]?.announcedEnding = true
            await summaries.waiting(URL(fileURLWithPath: folder.id))
        }
        guard var entry = running[id] else { return true }
        // Begin answers with the first of ready, cannot record or ended; later news travels as status.
        if entry.first == nil {
            if let reason = state.cannotRecord { answer(.cannotRecord(reason), entry: &entry) }
            else if state.phase == .recording { answer(.ready, entry: &entry) }
        }
        if state.phase == .ended {
            if entry.first == nil { answer(.ended, entry: &entry) }
            else if !entry.endRequested { await report(id, .ended) }
            let subscription = entry.subscription, observation = entry.observation, session = entry.session
            let pieces = entry.pieces
            Task {
                // The session has sent all it will; a feed whose transcript never opened ends here too.
                await pieces.finishReading()
                Task { await self.panel.end(id: id) }
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

    private func answer(_ value: RecordingSessionReport, entry: inout Running) {

        entry.first = value
        for answer in entry.beginners { answer.resume(returning: value) }
        entry.beginners.removeAll()
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
            folder: state.folder, recordedFolder: state.recordedFolder, processes: state.processes,
            microphoneTrack: state.microphoneTrack, callTrack: state.callTrack,
            microphoneCapture: state.microphoneCapture, callCapture: state.callCapture,
            transcript: state.transcript, callText: state.callText,
            failures: state.failures, cannotRecord: state.cannotRecord,
            audioWarning: state.audioWarning
        )
    }
}
