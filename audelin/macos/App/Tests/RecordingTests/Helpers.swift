import Recording
import Testing

/// Recording's reducer with the real Session reducer and a status read from `makePieces(_:)`.
let reducer = RecordingReducer(session: SessionReducer.reduce, status: readStatus)

func assert(
    _ state: RecordingState, _ event: RecordingEvent,
    sourceLocation: SourceLocation = #_sourceLocation,
    mutation: (inout RecordingState) -> Void = { _ in }
) {
    var expected = state
    mutation(&expected)
    #expect(reducer.reduce(state, event).0 == expected, "\(state) + \(event)", sourceLocation: sourceLocation)
}

func assert(
    _ state: RecordingState, _ event: RecordingEvent, delivers effect: RecordingEffect?,
    sourceLocation: SourceLocation = #_sourceLocation
) {
    #expect(reducer.reduce(state, event).1 == effect, "\(state) + \(event)", sourceLocation: sourceLocation)
}

/// The pieces of session `id` come to show `status` on their next event.
func assert(
    _ state: RecordingState, reporting status: RecordingSessionStatus, id: UInt64 = 1,
    sourceLocation: SourceLocation = #_sourceLocation,
    mutation: (inout RecordingState) -> Void = { _ in }
) {
    let pieces = makePieces(status)
    let sut = RecordingReducer(session: { _, _ in (pieces, nil) }, status: readStatus)
    var expected = state
    if state.session?.id == id, state.stage == .pieces { expected.pieces = pieces }
    mutation(&expected)
    #expect(sut.reduce(state, .session(id: id, .textFeedFinished)).0 == expected, "\(state) reporting \(status)", sourceLocation: sourceLocation)
}

/// Pieces that show `status` as `readStatus` reads it.
func makePieces(_ status: RecordingSessionStatus) -> SessionState {
    SessionState(
        phase: status.recording ? .recording : .bringingUp,
        recordedFolder: status.callID.map { SessionCallFolder(id: $0) },
        failures: RecordingFault.allCases.filter(status.faults.contains).map { SessionFailure(piece: "fault", message: "\($0)") },
        cannotRecord: status.cannotRecord,
        audioWarning: status.callSilent ? .callSilent : nil
    )
}

@Sendable func readStatus(_ pieces: SessionState) -> RecordingSessionStatus {
    RecordingSessionStatus(
        callID: pieces.recordedFolder?.id,
        recording: pieces.phase == .recording,
        cannotRecord: pieces.cannotRecord,
        faults: Set(RecordingFault.allCases.filter { pieces.failures.contains(SessionFailure(piece: "fault", message: "\($0)")) }),
        callSilent: pieces.audioWarning == .callSilent
    )
}

/// The pieces as an end leaves them.
func endPieces(_ state: inout RecordingState) {
    state.pieces = state.pieces.map { SessionReducer.reduce($0, .end).0 }
}
