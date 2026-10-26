import Recording
import Synchronization

public func composeRecording(
    initial: RecordingState = .init(),
    makePieces: @escaping @Sendable (UInt64) -> SessionPieces,
    liveText: @escaping @Sendable () -> Bool
) -> Recording {

    let destination = Mutex(RecordingDestination())
    let sessions = RecordingSessions(makePieces: makePieces, liveText: liveText, report: { id, report in
        destination.withLock { $0.recording }?.send(.sessionReported(id: id, report))
    })
    let recording = Recording(handler: RecordingEffectHandler(session: sessions), initial: initial)
    destination.withLock { $0.recording = recording }
    return recording
}

// The Recording owns its handler and adapter, so the return path must be weak.
private struct RecordingDestination: Sendable {

    weak var recording: Recording?
}
