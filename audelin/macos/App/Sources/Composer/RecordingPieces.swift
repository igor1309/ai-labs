import Preferences
import CoreAudioProcesses
import Foundation
import Recording

/// Builds the current recording's pieces, runs their work, and shows their state in the panel.
///
/// Recording's state says what the pieces do; this keeps only the handles to the concrete
/// pieces and to the panel's reading of them.
actor RecordingPieces {

    private struct Built {

        let id: UInt64
        let pieces: SessionPieces
        let handler: SessionEffectHandler
    }

    private struct Shown {

        let id: UInt64
        let reading: ReadingSubscription
        var previous: ObservedSession?
    }

    nonisolated let panel: AudelinPanel
    private let makePieces: @Sendable (UInt64) -> SessionPieces
    private let send: @Sendable (RecordingEvent) async -> Void
    private let summaries: SummaryCallbacks
    private let sink: any LogSink
    private var built: Built?
    private var shown: Shown?

    init(
        preferences: PreferencesStore, occupiedCallNames: @escaping @Sendable () throws -> [String],
        callApp: RecordingCallApp, processes: CoreAudioProcesses,
        boundary: ComposerBoundary,
        send: @escaping @Sendable (RecordingEvent) async -> Void,
        panel: AudelinPanel, finalization: TranscriptFinalizationModel, finalizationResources: FinalizationResources, summaries: SummaryCallbacks = .disabled
    ) {
        self.panel = panel
        self.makePieces = composeRecordingPieces(preferences: preferences, occupiedCallNames: occupiedCallNames, callApp: callApp,
                                                 processes: processes, boundary: boundary, finalization: finalization, finalizationResources: finalizationResources)
        self.summaries = summaries
        self.send = send
        self.sink = boundary.log
    }

    /// Runs one piece's work for the recording with that id, building its pieces on its first work.
    func run(id: UInt64, _ effect: SessionEffect) async -> SessionEvent {

        let built = await pieces(for: id)
        return await built.handler.handle(effect)
    }

    /// Shows the current recording's pieces in the panel; called with each Recording state in order.
    func observe(_ state: RecordingState) async {

        guard let id = state.session?.id, let pieces = state.pieces else { return }
        guard let current = shown, current.id == id else { return }
        let observed = ObservedSession(pieces)
        guard observed != current.previous else { return }
        let textWasRunning = current.previous.map { !Self.textStopped($0.value) } ?? true
        shown?.previous = observed
        await current.reading.sessionChanged(pieces)
        StateLog(sink: sink).session(pieces, id: id)
        // Notes show the call as waiting once its text stops; a later finalized transcript supersedes this.
        if textWasRunning, Self.textStopped(pieces), let folder = pieces.recordedFolder {
            await summaries.waiting(URL(fileURLWithPath: folder.id))
        }
        if pieces.phase == .ended { await panel.end(id: id) }
    }

    /// What the pieces show, as Recording reads them.
    nonisolated func status(_ state: SessionState) -> RecordingSessionStatus {

        RecordingSessionStatus(
            callID: state.recordedFolder?.callID,
            recording: state.phase == .recording, cannotRecord: state.cannotRecord,
            faults: recordingFaults(state), callSilent: state.audioWarning == .callSilent
        )
    }

    private func pieces(for id: UInt64) async -> Built {

        if let built, built.id == id { return built }
        let pieces = makePieces(id)
        let made = Built(id: id, pieces: pieces, handler: pieces.handler())
        built = made
        // The panel follows the recording from its first work, before it can record or take a switch.
        let feed = await pieces.readingText()
        let reading = await panel.begin(id: id, text: feed.text, speakers: feed.speakers, names: pieces.names, enableLiveText: { [send] in
            await send(.session(id: id, .liveTextChanged(true)))
        })
        shown = Shown(id: id, reading: reading)
        // The pieces' own reports reach Recording in order until the pieces release them, their last work.
        let events = pieces.events, send = send
        // A transcript failure is queued in Recording before the write that found it returns.
        pieces.transcriptFailures.connect(deliver: { await send(.session(id: id, $0)) })
        Task {
            for await event in events { await send(.session(id: id, event)) }
        }
        return made
    }

    private static func textStopped(_ state: SessionState) -> Bool {
        state.callText == .stopping || state.callText == .closed
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
