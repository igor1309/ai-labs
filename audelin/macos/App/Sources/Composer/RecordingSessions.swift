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
        var enders: [CheckedContinuation<Void, Never>] = []
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

    /// Returns once the Session has its begin; readiness and faults arrive later as status.
    func begin(id: UInt64) async {

        guard running[id] == nil else { return }
        let pieces = makePieces(id)
        let handler = pieces.handler()
        let session = makeSession(handler: handler)
        let enabled = liveText()
        let subscription = Task {
            let forwarding = subscribe(pieces, to: session)
            await withTaskCancellationHandler { await forwarding.value } onCancel: { forwarding.cancel() }
        }
        running[id] = Running(session: session, subscription: subscription, pieces: pieces)
        // Register before begin so even a short-lived state is retained.
        let states = await session.states()
        let feed = await pieces.readingText()
        let reading = await panel.begin(id: id, text: feed.text, speakers: feed.speakers, names: pieces.names, enableLiveText: {
            await self.send(.liveTextChanged(true), id: id)
        })
        session.send(.begin(liveText: enabled))
        running[id]?.observation = Task {
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

    /// Returns once the Session has ended and is torn down; Session decides when an end takes effect.
    func end(id: UInt64) async {

        guard let entry = running[id] else { return }
        entry.session.send(.end)
        await withCheckedContinuation { running[id]?.enders.append($0) }
    }

    private func send(_ event: SessionEvent, id: UInt64) {

        running[id]?.session.send(event)
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
        guard let entry = running[id] else { return true }
        if state.phase == .ended {
            await report(id, .ended)
            let subscription = entry.subscription, observation = entry.observation, session = entry.session
            Task {
                Task { await self.panel.end(id: id) }
                subscription.cancel()
                await subscription.value
                await session.end()
                await observation?.value
                self.forget(id: id)
            }
        }
        return state.phase == .ended
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
