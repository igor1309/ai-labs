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
        let handler: SessionEffectHandler
        let reading: Task<ReadingSubscription, Never>
    }

    nonisolated let panel: AudelinPanel
    private let makePieces: @Sendable (UInt64) -> SessionPieces
    private let send: @Sendable (RecordingEvent) async -> Void
    private let summaries: SummaryCallbacks
    private let canWatch: @MainActor @Sendable (UInt64) -> Bool
    private let sink: any LogSink
    private var built: Built?
    private var previous: SessionState?

    init(
        preferences: PreferencesStore, occupiedCallNames: @escaping @Sendable () throws -> [String],
        callApp: RecordingCallApp, processes: CoreAudioProcesses,
        boundary: ComposerBoundary,
        send: @escaping @Sendable (RecordingEvent) async -> Void,
        panel: AudelinPanel, canWatch: @escaping @MainActor @Sendable (UInt64) -> Bool,
        transcriptOutput: AsyncStream<RecordingTranscript>.Continuation, finalizationResources: FinalizationResources, summaries: SummaryCallbacks = .disabled
    ) {
        self.panel = panel
        self.makePieces = composeRecordingPieces(preferences: preferences, occupiedCallNames: occupiedCallNames, callApp: callApp,
                                                 processes: processes, boundary: boundary, transcriptOutput: transcriptOutput, finalizationResources: finalizationResources)
        self.summaries = summaries
        self.canWatch = canWatch
        self.send = send
        self.sink = boundary.log
    }

    /// Runs one piece's work for the recording with that id, building its pieces on its first work.
    func run(id: UInt64, _ effect: SessionEffect) async -> SessionEvent {

        let built = await pieces(for: id)
        return await built.handler.handle(effect)
    }

    /// Shows the current recording's pieces in the panel; called with each Recording state in order.
    func observe(id: UInt64, _ pieces: SessionState, at instant: Double) async {

        guard let built, built.id == id else { return }
        let reading = await built.reading.value
        guard self.built?.id == id else { return }
        let textWasRunning = previous.map { !Self.textStopped($0) } ?? true
        previous = pieces
        await reading.sessionChanged(pieces, at: instant)
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
        let panel = panel, send = send, canWatch = canWatch
        let feed = pieces.readingText
        let reading = Task {
            await panel.begin(id: id, text: feed.text, speakers: feed.speakers, names: pieces.names,
                              canWatch: { canWatch(id) }, enableLiveText: {
                await send(.session(id: id, .liveTextChanged(true)))
            })
        }
        let made = Built(id: id, handler: pieces.handler(), reading: reading)
        built = made
        previous = nil
        // The pieces' own reports reach Recording in order until the pieces release them, their last work.
        let events = pieces.events
        // A transcript failure is queued in Recording before the write that found it returns.
        pieces.transcriptFailures.connect(deliver: { await send(.session(id: id, $0)) })
        Task {
            for await event in events { await send(.session(id: id, event)) }
        }
        // The panel follows the recording from its first work, before it can record or take a switch.
        _ = await reading.value
        return made
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
