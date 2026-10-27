import Recording
import Synchronization

public func composeRecording(
    initial: RecordingState = .init(),
    makePieces: @escaping @Sendable (UInt64) -> SessionPieces,
    liveText: @escaping @Sendable () -> Bool,
    panel: AudelinPanel
) async -> Recording {

    await composeRecording(initial: initial, makePieces: makePieces, liveText: liveText, sink: SystemLogSink(), panel: panel)
}

func composeRecording(
    initial: RecordingState = .init(),
    makePieces: @escaping @Sendable (UInt64) -> SessionPieces,
    liveText: @escaping @Sendable () -> Bool,
    sink: any LogSink,
    panel: AudelinPanel
) async -> Recording {

    let destination = Mutex(RecordingDestination())
    let sessions = RecordingSessions(makePieces: makePieces, liveText: liveText, report: { id, report in
        destination.withLock { $0.recording }?.send(.sessionReported(id: id, report))
    }, connect: subscribe, sink: sink, panel: panel)
    let recording = Recording(handler: RecordingEffectHandler(session: LoggingRecordingSession(base: sessions, sink: sink)), initial: initial)
    let logging = await RecordingStateLogging(recording: recording, sink: sink)
    destination.withLock { $0.recording = recording; $0.logging = logging }
    return recording
}

// The Recording owns its handler and adapter, so the return path must be weak.
private struct RecordingDestination: Sendable {

    weak var recording: Recording?
    var logging: RecordingStateLogging?
}
