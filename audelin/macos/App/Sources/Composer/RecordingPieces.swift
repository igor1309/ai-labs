import Preferences
import CoreAudioProcesses
import Foundation
import Recording

/// Builds the recording's pieces and connects its outputs to their consumers.
///
/// Recording's state says what the pieces do; this keeps only their concrete handles.
@MainActor
final class RecordingPieces {

    private struct Built {

        let id: UInt64
        let handler: SessionEffectHandler
    }

    private let panel: AudelinPanel
    private let makePieces: @Sendable (UInt64) -> SessionPieces
    private let send: @Sendable (RecordingEvent) async -> Void
    private let summaries: SummaryCallbacks
    private let sink: any LogSink
    private var built: Built?

    init(
        preferences: PreferencesStore, occupiedCallNames: @escaping @Sendable () throws -> [String],
        callApp: RecordingCallApp, processes: CoreAudioProcesses,
        boundary: ComposerBoundary,
        send: @escaping @Sendable (RecordingEvent) async -> Void,
        panel: AudelinPanel,
        transcriptOutput: AsyncStream<RecordingTranscript>.Continuation, finalizationResources: FinalizationResources, summaries: SummaryCallbacks = .disabled
    ) {
        self.panel = panel
        self.makePieces = composeRecordingPieces(preferences: preferences, occupiedCallNames: occupiedCallNames, callApp: callApp,
                                                 processes: processes, boundary: boundary, transcriptOutput: transcriptOutput, finalizationResources: finalizationResources)
        self.summaries = summaries
        self.send = send
        self.sink = boundary.log
    }

    /// Runs one effect for the Session that requested it.
    func run(id: UInt64, _ effect: SessionEffect) async -> SessionEvent {

        // Recording discards replies whose session id is no longer current.
        guard let built, built.id == id else { return .end }
        return await built.handler.handle(effect)
    }

    /// Connects a new Session before Recording dispatches its first effect.
    func observe(id: UInt64, _ pieces: SessionState, after previous: SessionState?, at instant: Double) {

        if previous == nil, pieces.phase != .ended { prepare(id: id) }
        let textWasRunning = previous.map { !Self.textStopped($0) } ?? true
        panel.sessionChanged(id: id, pieces, after: previous?.phase, at: instant)
        StateLog(sink: sink).session(pieces, id: id)
        // Notes show the call as waiting once its text stops; a later finalized transcript supersedes this.
        if textWasRunning, Self.textStopped(pieces), let folder = pieces.recordedFolder {
            Task { await summaries.waiting(URL(fileURLWithPath: folder.id)) }
        }
    }

    /// What the pieces show, as Recording reads them.
    nonisolated func status(_ state: SessionState) -> RecordingSessionStatus {

        RecordingSessionStatus(
            callID: state.recordedFolder?.callID,
            recording: state.phase == .recording, cannotRecord: state.cannotRecord,
            faults: recordingFaults(state), callSilent: state.audioWarning == .callSilent
        )
    }

    private func prepare(id: UInt64) {
        let pieces = makePieces(id)
        let send = send
        let feed = pieces.readingText
        panel.begin(id: id, text: feed.text, speakers: feed.speakers, names: pieces.names)
        built = Built(id: id, handler: pieces.handler())
        // The pieces' own reports reach Recording in order until the pieces release them, their last work.
        let events = pieces.events
        // A transcript failure is queued in Recording before the write that found it returns.
        pieces.transcriptFailures.connect(deliver: { await send(.session(id: id, $0)) })
        Task {
            for await event in events { await send(.session(id: id, event)) }
        }
    }

    private static func textStopped(_ state: SessionState) -> Bool {
        state.callText == .stopping || state.callText == .closed
    }
}

// Compare the fields read by the panel mapping, state log and report delivery.
// Session's private audio tracking can change for every measured window.
struct ObservedSession: Equatable {

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
