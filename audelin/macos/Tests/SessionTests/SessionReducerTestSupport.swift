import Foundation
import Session

extension SessionReducerTests {

    /// A bring-up result whose next step depends on neither the selection nor the wanted live text.
    struct OpeningStep: Sendable {

        let piece: SessionState.Piece
        let next: SessionState.Piece
        let effect: SessionEffect
    }

    struct HeldStart: Sendable {

        let piece: SessionState.Piece
        let firstStop: SessionState.Piece
    }

    /// Each way a side can be unable to record without leaving a capture to stop.
    enum Unusable: CaseIterable, Sendable {

        case trackDown, captureDown, accessLost, trackFailed

        func apply(to state: inout SessionState, on side: SessionSide) {

            switch self {
            case .trackDown: state[status: .track(side)] = .down
            case .captureDown: state[status: .capture(side)] = .down
            case .accessLost: state.health[.access(side)] = .accessLost
            case .trackFailed: state.health[.track(side)] = .failed(anyError())
            }
        }
    }

    enum LiveTextChange: CaseIterable, Sendable {

        case liveText, preference

        func event(_ enabled: Bool) -> SessionEvent {

            switch self {
            case .liveText: .liveTextChanged(enabled)
            case .preference: .preferenceChanged(enabled)
            }
        }
    }

    /// The phases and call text statuses in which a status from call text counts.
    struct LiveTextHost: Sendable {

        let phase: SessionState.Phase
        let callText: SessionState.PieceStatus
    }
}

let sides: [SessionSide] = [.microphone, .call]
let results: [String?] = [nil, anyError()]
let liveTexts: [SessionState.LiveText] = [.off, .gettingReady, .on]
let phases: [SessionState.Phase] = [.idle, .bringingUp, .recording, .ending, .ended]
let statuses: [SessionState.PieceStatus] = [.down, .starting, .up, .stopping, .closed]
let missingModels: [([String], String)] = [
    (["Parakeet v3"], "Parakeet v3"),
    (["Parakeet v3", "Nemotron"], "Parakeet v3, Nemotron"),
]

let bringUpOrder: [SessionState.Piece] = [
    .folder, .processes, .track(.microphone), .track(.call), .transcript, .callText, .capture(.microphone), .capture(.call),
]

let stopOrder: [SessionState.Piece] = [
    .capture(.microphone), .capture(.call), .track(.microphone), .track(.call), .callText, .transcript,
]

let openingSteps: [SessionReducerTests.OpeningStep] = [
    .init(piece: .track(.microphone), next: .track(.call), effect: .openTrack(.call)),
    .init(piece: .track(.call), next: .transcript, effect: .openTranscript),
    .init(piece: .callText, next: .capture(.microphone), effect: .startMicrophoneCapture),
]

let heldStarts: [SessionReducerTests.HeldStart] = [
    .init(piece: .track(.microphone), firstStop: .track(.microphone)),
    .init(piece: .track(.call), firstStop: .track(.microphone)),
    .init(piece: .transcript, firstStop: .track(.microphone)),
    .init(piece: .callText, firstStop: .track(.microphone)),
    .init(piece: .capture(.microphone), firstStop: .capture(.microphone)),
    .init(piece: .capture(.call), firstStop: .capture(.microphone)),
]

let liveTextHosts: [SessionReducerTests.LiveTextHost] = [
    .init(phase: .bringingUp, callText: .starting),
    .init(phase: .bringingUp, callText: .up),
    .init(phase: .recording, callText: .starting),
    .init(phase: .recording, callText: .up),
]

func unavailable(_ side: SessionSide) -> [[SessionState.Piece: SessionState.Health]] {

    [[.access(side): .accessLost], [.capture(side): .failed(anyError())]]
}

func unmatchedReplies() -> [(SessionState, SessionEvent)] {

    let held = SessionState.LiveTextRequest(id: anyRequestID(), enabled: .random())
    let holding = makeRecording().with { $0.pendingLiveText = held }
    let error = [nil, anyError()].randomElement()!
    return [
        (makeRecording(), .liveTextSet(request: held, error: error)),
        (holding, .liveTextSet(request: .init(id: held.id + 1, enabled: held.enabled), error: error)),
        (holding, .liveTextSet(request: .init(id: held.id, enabled: !held.enabled), error: error)),
    ]
}

func resultsNotAwaited() -> [(SessionState, SessionEvent)] {

    let error = [nil, anyError()].randomElement()!
    var awaitingStart: [(SessionState.Piece, SessionEvent)] = [
        (.folder, .folderFinished(error: nil, folder: anyFolder())),
        (.folder, .folderFinished(error: anyError())),
        (.processes, .processesFinished(selection: anySelection(), error: nil)),
        (.processes, .processesFinished(selection: nil, error: anyError())),
        (.transcript, .transcriptFinished(error: error)),
        (.callText, .callTextFinished(error: error)),
    ]
    var awaitingStop: [(SessionState.Piece, SessionEvent)] = [
        (.transcript, .transcriptClosed(error: error)),
        (.callText, .callTextStopped(error: error)),
    ]
    for side in sides {
        awaitingStart.append((.track(side), .trackFinished(side, error: error)))
        awaitingStart.append((.capture(side), .captureFinished(side, error: error)))
        awaitingStop.append((.track(side), .trackClosed(side, error: error)))
        awaitingStop.append((.capture(side), .captureStopped(side, error: error)))
    }
    let cases = [(SessionState.PieceStatus.starting, awaitingStart), (.stopping, awaitingStop)]
    return cases.flatMap { awaited, events in
        events.flatMap { piece, event in
            statuses.filter { $0 != awaited }.map { status in
                (makeScrambled(phases.randomElement()!).with { $0[status: piece] = status }, event)
            }
        }
    }
}

func eventsInTheWrongPhase() -> [(SessionState, SessionEvent)] {

    var cases: [(SessionState, SessionEvent)] = []
    for phase in phases where phase != .idle {
        cases.append((makeScrambled(phase), .begin(liveText: .random())))
    }
    for phase in phases where phase != .bringingUp {
        cases.append((makeScrambled(phase), .modelsChecked(missing: [])))
        cases.append((makeScrambled(phase), .modelsChecked(missing: [anyError()])))
    }
    for status in statuses where status != .down {
        cases.append((makeScrambled(.bringingUp).with { $0.folder = status }, .modelsChecked(missing: [])))
    }
    for phase in phases where phase != .recording {
        for change in SessionReducerTests.LiveTextChange.allCases {
            cases.append((makeScrambled(phase), change.event(.random())))
        }
    }
    for phase in phases {
        for side in sides { cases.append((makeScrambled(phase), .accessChanged(side, available: true))) }
    }
    for phase in [SessionState.Phase.idle, .ended] {
        for side in sides { cases.append((makeScrambled(phase), .accessChanged(side, available: false))) }
        for piece in bringUpOrder { cases.append((makeScrambled(phase), .pieceFailed(piece, error: anyError()))) }
    }
    for status in liveTexts {
        for phase in [SessionState.Phase.idle, .ending, .ended] {
            let state = makeScrambled(phase).with {
                $0.wantedLiveText = true
                $0.callText = .up
            }
            cases.append((state, .callTextStatusChanged(status)))
        }
        for phase in [SessionState.Phase.bringingUp, .recording] {
            for callText in [SessionState.PieceStatus.down, .stopping, .closed] {
                let state = makeScrambled(phase).with {
                    $0.wantedLiveText = true
                    $0.callText = callText
                }
                cases.append((state, .callTextStatusChanged(status)))
            }
        }
    }
    return cases
}

// MARK: - States

func makeState(_ phase: SessionState.Phase) -> SessionState {

    SessionState(
        wantedLiveText: .random(),
        liveTextRequestID: anyRequestID(),
        phase: phase,
        liveText: liveTexts.randomElement()!,
        recordedFolder: anyFolder(),
        processSelection: anySelection(),
        failures: [.init(piece: anyError(), message: anyError())]
    )
}

func makeIdle() -> SessionState { makeState(.idle) }

func makeCheckingModels() -> SessionState { makeState(.bringingUp) }

/// Bring-up holding `piece`: every piece before it in bring-up order is up.
func makeBringingUp(starting piece: SessionState.Piece) -> SessionState {

    makeState(.bringingUp).with { state in
        for earlier in bringUpOrder.prefix(while: { $0 != piece }) { state[status: earlier] = .up }
        state[status: piece] = .starting
    }
}

func makeEndingWhileStarting(_ piece: SessionState.Piece) -> SessionState {

    makeBringingUp(starting: piece).with { $0.phase = .ending }
}

func makeRecording(withDown down: [SessionState.Piece] = []) -> SessionState {

    makeState(.recording).with { state in
        for piece in bringUpOrder { state[status: piece] = .up }
        for piece in down { state[status: piece] = .down }
    }
}

/// Recording while a live text request waits for its reply: `stale` when a newer change came after it.
func makeHoldingLiveText(stale: Bool = false) -> SessionState {

    makeRecording().with {
        $0.pendingLiveText = .init(id: $0.liveTextRequestID - (stale ? 1 : 0), enabled: .random())
    }
}

/// Bring-down holding `piece`: every piece before it in stop order is closed.
func makeStopping(_ piece: SessionState.Piece) -> SessionState {

    makeRecording().with { state in
        state.phase = .ending
        for earlier in piecesStopped(before: piece) { state[status: earlier] = .closed }
        state[status: piece] = .stopping
    }
}

func makeHosting(_ host: SessionReducerTests.LiveTextHost) -> SessionState {

    makeState(host.phase).with { $0.callText = host.callText }
}

/// Any phase and piece statuses: for events whose guard must decide on one field alone.
func makeScrambled(_ phase: SessionState.Phase) -> SessionState {

    makeState(phase).with { state in
        for piece in bringUpOrder { state[status: piece] = statuses.randomElement()! }
    }
}

func piecesStopped(before piece: SessionState.Piece) -> [SessionState.Piece] {

    Array(stopOrder.prefix(while: { $0 != piece }))
}

func nextPiece(after piece: SessionState.Piece) -> SessionState.Piece? {

    stopOrder.drop(while: { $0 != piece }).dropFirst().first
}

func nextStopEffect(after piece: SessionState.Piece) -> SessionEffect? {

    nextPiece(after: piece).map(stopEffect)
}

// MARK: - Events and effects

func startResult(_ piece: SessionState.Piece, error: String?) -> SessionEvent {

    switch piece {
    case let .track(side): .trackFinished(side, error: error)
    case .transcript: .transcriptFinished(error: error)
    case .callText: .callTextFinished(error: error)
    case let .capture(side): .captureFinished(side, error: error)
    case .folder, .processes, .access: preconditionFailure("\(piece) has its own result")
    }
}

func stopResult(_ piece: SessionState.Piece, error: String?) -> SessionEvent {

    switch piece {
    case let .capture(side): .captureStopped(side, error: error)
    case let .track(side): .trackClosed(side, error: error)
    case .callText: .callTextStopped(error: error)
    case .transcript: .transcriptClosed(error: error)
    case .folder, .processes, .access: preconditionFailure("\(piece) is not stopped by an effect")
    }
}

func stopEffect(_ piece: SessionState.Piece) -> SessionEffect {

    switch piece {
    case let .capture(side): .stopCapture(side)
    case let .track(side): .closeTrack(side)
    case .callText: .stopCallText
    case .transcript: .closeTranscript
    case .folder, .processes, .access: preconditionFailure("\(piece) is not stopped by an effect")
    }
}

// MARK: - Any values

func anyError() -> String { "error \(UUID().uuidString)" }
func anyFolder() -> SessionCallFolder { .init(id: UUID().uuidString) }
func anySelection() -> SessionProcessSelection { .init(id: UUID().uuidString) }
func anyRequestID() -> UInt64 { .random(in: 1 ... 1_000) }

// MARK: - State edits

extension SessionState {

    func with(_ change: (inout SessionState) -> Void) -> SessionState {

        var state = self
        change(&state)
        return state
    }

    subscript(status piece: Piece) -> PieceStatus {

        get {
            switch piece {
            case .folder: folder
            case .processes: processes
            case let .track(side): side == .microphone ? microphoneTrack : callTrack
            case .transcript: transcript
            case .callText: callText
            case let .capture(side): side == .microphone ? microphoneCapture : callCapture
            case .access: preconditionFailure("access has no status")
            }
        }
        set {
            switch piece {
            case .folder: folder = newValue
            case .processes: processes = newValue
            case .track(.microphone): microphoneTrack = newValue
            case .track(.call): callTrack = newValue
            case .transcript: transcript = newValue
            case .callText: callText = newValue
            case .capture(.microphone): microphoneCapture = newValue
            case .capture(.call): callCapture = newValue
            case .access: preconditionFailure("access has no status")
            }
        }
    }

    mutating func fail(_ piece: Piece, _ error: String) {

        health[piece] = .failed(error)
        failures.append(.init(piece: piece.label, message: error))
    }

    mutating func loseAccess(_ side: SessionSide) {

        health[.access(side)] = .accessLost
        failures.append(.init(piece: "\(side) access", message: "access lost"))
    }

    /// What follows a piece's stop result in bring-down: the next piece stops, or the session ends.
    mutating func goOn(after piece: Piece) {

        if let next = nextPiece(after: piece) {
            self[status: next] = .stopping
        } else {
            folder = .closed
            processes = .closed
            phase = .ended
        }
    }
}

extension SessionState.Piece {

    var label: String {

        switch self {
        case .folder: "folder"
        case .processes: "processes"
        case let .track(side): "\(side) track"
        case .transcript: "transcript"
        case .callText: "call text"
        case let .capture(side): "\(side) capture"
        case let .access(side): "\(side) access"
        }
    }
}

extension SessionSide {

    var other: SessionSide { self == .microphone ? .call : .microphone }
}
