import Machine

/// The two destinations in one recording.
public enum SessionSide: Equatable, Sendable {

    case microphone
    case call
}

/// The process choice passed from the call-app adapter to a capture.
public enum SessionProcessSelection: Equatable, Sendable {

    case only([Int32])
    case allExcept([Int32])
}

public protocol SessionFolder: Sendable {

    func create() async throws
}

public protocol SessionProcesses: Sendable {

    func select() async throws -> SessionProcessSelection
}

public protocol SessionCapture: Sendable {

    func start(selection: SessionProcessSelection) async throws
    func stop() async throws
}

public protocol SessionTrackFile: Sendable {

    func open() async throws
    func close() async throws
}

public protocol SessionCallText: Sendable {

    func start(enabled: Bool) async throws
    func setEnabled(_ enabled: Bool) async throws
    func stop() async throws
}

public protocol SessionTranscript: Sendable {

    func open() async throws
    func close() async throws
}

/// A failure named in the session state.
public struct SessionFailure: Equatable, Sendable, Error, CustomStringConvertible {

    public let piece: String
    public let message: String

    public init(piece: String, message: String) {

        self.piece = piece
        self.message = message
    }

    public var description: String {

        "\(piece): \(message)"
    }
}

public struct SessionState: Equatable, Sendable {

    public enum Phase: Equatable, Sendable {

        case idle
        case bringingUp
        case recording
        case ending
        case ended
    }

    public enum LiveText: Equatable, Sendable {

        case off
        case gettingReady
        case on
    }

    public enum Piece: Equatable, Sendable {

        case folder
        case processes
        case track(SessionSide)
        case transcript
        case callText
        case capture(SessionSide)
        case access(SessionSide)
    }

    public enum PieceStatus: Equatable, Sendable {

        case down
        case starting
        case up
        case stopping
        case closed
        case failed(String)
    }

    public var phase: Phase
    public var liveText: LiveText
    public var folder: PieceStatus
    public var processes: PieceStatus
    public var microphoneTrack: PieceStatus
    public var callTrack: PieceStatus
    public var microphoneCapture: PieceStatus
    public var callCapture: PieceStatus
    public var transcript: PieceStatus
    public var callText: PieceStatus
    public var processSelection: SessionProcessSelection?
    public var failures: [SessionFailure]
    public var cannotRecord: String?

    public init(
        phase: Phase = .idle,
        liveText: LiveText = .off,
        folder: PieceStatus = .down,
        processes: PieceStatus = .down,
        microphoneTrack: PieceStatus = .down,
        callTrack: PieceStatus = .down,
        microphoneCapture: PieceStatus = .down,
        callCapture: PieceStatus = .down,
        transcript: PieceStatus = .down,
        callText: PieceStatus = .down,
        processSelection: SessionProcessSelection? = nil,
        failures: [SessionFailure] = [],
        cannotRecord: String? = nil
    ) {

        self.phase = phase
        self.liveText = liveText
        self.folder = folder
        self.processes = processes
        self.microphoneTrack = microphoneTrack
        self.callTrack = callTrack
        self.microphoneCapture = microphoneCapture
        self.callCapture = callCapture
        self.transcript = transcript
        self.callText = callText
        self.processSelection = processSelection
        self.failures = failures
        self.cannotRecord = cannotRecord
    }
}

public enum SessionEvent: Equatable, Sendable {

    case begin(liveText: Bool)
    case end
    case liveTextChanged(Bool)
    case preferenceChanged(Bool)
    case accessChanged(SessionSide, available: Bool)
    case folderFinished(error: String?)
    case processesFinished(selection: SessionProcessSelection?, error: String?)
    case trackFinished(SessionSide, error: String?)
    case transcriptFinished(error: String?)
    case callTextFinished(error: String?)
    case captureFinished(SessionSide, error: String?)
    case captureStopped(SessionSide, error: String?)
    case trackClosed(SessionSide, error: String?)
    case transcriptClosed(error: String?)
    case callTextStopped(error: String?)
    case liveTextSet(enabled: Bool, error: String?)
    case pieceFailed(SessionState.Piece, error: String)
}

public enum SessionEffect: Equatable, Sendable {

    case createFolder
    case selectProcesses
    case openTrack(SessionSide)
    case openTranscript
    case startCallText(enabled: Bool)
    case startCapture(SessionSide, selection: SessionProcessSelection)
    case stopCapture(SessionSide)
    case closeTrack(SessionSide)
    case stopCallText
    case closeTranscript
    case setLiveText(Bool)
}

/// Purely orders one bring-up or bring-down operation at a time.
public enum SessionReducer {

    public static func reduce(_ state: SessionState, _ event: SessionEvent) -> (SessionState, SessionEffect?) {

        var state = state
        switch event {
        case let .begin(enabled):
            guard state.phase == .idle else { return (state, nil) }
            state.phase = .bringingUp
            state.liveText = enabled ? .gettingReady : .off
            state.folder = .starting
            return (state, .createFolder)

        case .end:
            guard state.phase != .ended && state.phase != .ending else { return (state, nil) }
            state.phase = .ending
            return nextDown(&state)

        case let .liveTextChanged(enabled), let .preferenceChanged(enabled):
            guard state.phase == .recording else { return (state, nil) }
            return (state, .setLiveText(enabled))

        case let .accessChanged(side, available):
            guard state.phase == .bringingUp || state.phase == .recording else { return (state, nil) }
            guard !available else { return (state, nil) }
            addFailure(&state, .init(piece: side.name + " access", message: "access lost"))
            setCapture(&state, side, .failed("access lost"))
            updateRecordability(&state)
            return (state, nil)

        case let .pieceFailed(piece, error):
            guard state.phase == .bringingUp || state.phase == .recording else { return (state, nil) }
            setStatus(&state, piece, .failed(error))
            addFailure(&state, .init(piece: piece.name, message: error))
            if piece == .folder {
                state.cannotRecord = "folder: \(error)"
            } else {
                updateRecordability(&state)
            }
            return (state, nil)

        case let .folderFinished(error):
            guard state.folder == .starting else { return (state, nil) }
            state.folder = error == nil ? .up : .failed(error!)
            guard let error else {
                if state.phase == .ending { state.phase = .ended; return (state, nil) }
                state.processes = .starting
                return (state, .selectProcesses)
            }
            fail(&state, "folder", error, cannotRecord: true)
            if state.phase == .ending { state.phase = .ended }
            return (state, nil)

        case let .processesFinished(selection, error):
            let prior = state.processes
            guard prior == .starting || (state.phase == .bringingUp && prior.isFailed) else { return (state, nil) }
            if prior == .starting {
                state.processes = error == nil ? .up : .failed(error!)
                if let error { addFailure(&state, .init(piece: "processes", message: error)) }
                state.processSelection = selection
            }
            if state.phase == .ending { state.phase = .ended; return (state, nil) }
            guard state.phase == .bringingUp else { return (state, nil) }
            state.microphoneTrack = .starting
            return (state, .openTrack(.microphone))

        case let .trackFinished(side, error):
            let prior = state.track(for: side)
            guard prior == .starting || (state.phase == .bringingUp && prior.isFailed) else { return (state, nil) }
            if prior == .starting {
                setTrack(&state, side, error == nil ? .up : .failed(error!))
                if let error { addFailure(&state, .init(piece: side.trackName, message: error)) }
            }
            if state.phase == .ending { return nextDown(&state) }
            if side == .microphone {
                state.callTrack = .starting
                return (state, .openTrack(.call))
            }
            state.transcript = .starting
            return (state, .openTranscript)

        case let .transcriptFinished(error):
            let prior = state.transcript
            guard prior == .starting || (state.phase == .bringingUp && prior.isFailed) else { return (state, nil) }
            if prior == .starting {
                state.transcript = error == nil ? .up : .failed(error!)
                if let error { addFailure(&state, .init(piece: "transcript", message: error)) }
            }
            if state.phase == .ending { return nextDown(&state) }
            state.callText = .starting
            return (state, .startCallText(enabled: state.liveText != .off))

        case let .callTextFinished(error):
            let prior = state.callText
            guard prior == .starting || (state.phase == .bringingUp && prior.isFailed) else { return (state, nil) }
            if prior == .starting {
                state.callText = error == nil ? .up : .failed(error!)
                if let error { addFailure(&state, .init(piece: "call text", message: error)) }
            }
            if state.phase == .ending { return nextDown(&state) }
            if state.microphoneCapture.isFailed {
                return startCallCaptureOrFinish(&state)
            }
            state.microphoneCapture = .starting
            return (state, .startCapture(.microphone, selection: state.processSelection ?? .only([])))

        case let .captureFinished(side, error):
            let prior = state.capture(for: side)
            guard prior == .starting || (state.phase == .bringingUp && prior.isFailed) else { return (state, nil) }
            guard prior == .starting else {
                if side == .microphone { return startCallCaptureOrFinish(&state) }
                return finishCaptureBringUp(&state)
            }
            setCapture(&state, side, error == nil ? .up : .failed(error!))
            if let error { addFailure(&state, .init(piece: side.captureName, message: error)) }
            if side == .microphone {
                if state.phase == .ending { return nextDown(&state) }
                return startCallCaptureOrFinish(&state)
            }
            if state.phase == .ending { return nextDown(&state) }
            return finishCaptureBringUp(&state)

        case let .captureStopped(side, error):
            guard state.capture(for: side) == .stopping else { return (state, nil) }
            setCapture(&state, side, error == nil ? .closed : .failed(error!))
            if let error { addFailure(&state, .init(piece: side.captureName, message: error)) }
            return nextDown(&state)

        case let .trackClosed(side, error):
            guard state.track(for: side) == .stopping else { return (state, nil) }
            setTrack(&state, side, error == nil ? .closed : .failed(error!))
            if let error { addFailure(&state, .init(piece: side.trackName, message: error)) }
            return nextDown(&state)

        case let .callTextStopped(error):
            guard state.callText == .stopping else { return (state, nil) }
            state.callText = error == nil ? .closed : .failed(error!)
            if let error { addFailure(&state, .init(piece: "call text", message: error)) }
            return nextDown(&state)

        case let .transcriptClosed(error):
            guard state.transcript == .stopping else { return (state, nil) }
            state.transcript = error == nil ? .closed : .failed(error!)
            if let error { addFailure(&state, .init(piece: "transcript", message: error)) }
            return nextDown(&state)

        case let .liveTextSet(enabled, error):
            guard state.phase == .recording else { return (state, nil) }
            if let error { addFailure(&state, .init(piece: "live text", message: error)) }
            else { state.liveText = enabled ? .on : .off }
            return (state, nil)
        }
    }

    private static func nextDown(_ state: inout SessionState) -> (SessionState, SessionEffect?) {

        guard state.phase == .ending else { return (state, nil) }
        if state.microphoneCapture == .up { state.microphoneCapture = .stopping; return (state, .stopCapture(.microphone)) }
        if state.callCapture == .up { state.callCapture = .stopping; return (state, .stopCapture(.call)) }
        if state.microphoneCapture == .starting || state.callCapture == .starting { return (state, nil) }
        if state.microphoneTrack == .up { state.microphoneTrack = .stopping; return (state, .closeTrack(.microphone)) }
        if state.callTrack == .up { state.callTrack = .stopping; return (state, .closeTrack(.call)) }
        if state.microphoneTrack == .starting || state.callTrack == .starting { return (state, nil) }
        if state.callText == .up { state.callText = .stopping; return (state, .stopCallText) }
        if state.callText == .starting { return (state, nil) }
        if state.transcript == .up { state.transcript = .stopping; return (state, .closeTranscript) }
        if state.transcript == .starting || state.folder == .starting || state.processes == .starting { return (state, nil) }
        state.phase = .ended
        return (state, nil)
    }

    private static func addFailure(_ state: inout SessionState, _ failure: SessionFailure) {

        state.failures.append(failure)
    }

    private static func fail(_ state: inout SessionState, _ piece: String, _ error: String, cannotRecord: Bool) {

        addFailure(&state, .init(piece: piece, message: error))
        if cannotRecord { state.cannotRecord = "\(piece): \(error)" }
    }

    private static func hasUsableTrack(_ state: SessionState) -> Bool {

        (state.microphoneTrack.isUp && state.microphoneCapture.isUp)
            || (state.callTrack.isUp && state.callCapture.isUp)
    }

    private static func updateRecordability(_ state: inout SessionState) {

        if !hasUsableTrack(state) && state.phase == .recording {
            state.cannotRecord = "no track can record"
            state.phase = .bringingUp
        }
    }

    private static func startCallCaptureOrFinish(_ state: inout SessionState) -> (SessionState, SessionEffect?) {

        guard state.phase == .bringingUp else { return finishCaptureBringUp(&state) }
        if state.callCapture == .down {
            state.callCapture = .starting
            return (state, .startCapture(.call, selection: state.processSelection ?? .only([])))
        }
        return finishCaptureBringUp(&state)
    }

    private static func finishCaptureBringUp(_ state: inout SessionState) -> (SessionState, SessionEffect?) {

        if hasUsableTrack(state) {
            state.phase = .recording
        } else {
            state.cannotRecord = "no track can record"
            state.phase = .bringingUp
        }
        state.liveText = state.liveText == .gettingReady && state.callText == .up ? .gettingReady : state.liveText
        return (state, nil)
    }

    private static func setTrack(_ state: inout SessionState, _ side: SessionSide, _ status: SessionState.PieceStatus) {

        if side == .microphone { state.microphoneTrack = status } else { state.callTrack = status }
    }

    private static func setCapture(_ state: inout SessionState, _ side: SessionSide, _ status: SessionState.PieceStatus) {

        if side == .microphone { state.microphoneCapture = status } else { state.callCapture = status }
    }

    private static func setStatus(_ state: inout SessionState, _ piece: SessionState.Piece, _ status: SessionState.PieceStatus) {

        switch piece {
        case .folder: state.folder = status
        case .processes: state.processes = status
        case let .track(side): setTrack(&state, side, status)
        case .transcript: state.transcript = status
        case .callText: state.callText = status
        case let .capture(side): setCapture(&state, side, status)
        case .access: break
        }
    }
}

public extension SessionState.PieceStatus {

    var isUp: Bool {

        switch self { case .up, .stopping: true; default: false }
    }

    var isRecording: Bool {

        switch self { case .up, .stopping: true; default: false }
    }

}

private extension SessionState.PieceStatus {

    var isFailed: Bool {

        if case .failed = self { true } else { false }
    }
}

private extension SessionSide {

    var name: String { self == .microphone ? "microphone" : "call" }
    var trackName: String { name + " track" }
    var captureName: String { name + " capture" }
}

private extension SessionState.Piece {

    var name: String {
        switch self {
        case .folder: "folder"
        case .processes: "processes"
        case let .track(side): side.trackName
        case .transcript: "transcript"
        case .callText: "call text"
        case let .capture(side): side.captureName
        case let .access(side): side.name + " access"
        }
    }
}

private extension SessionState {

    func track(for side: SessionSide) -> PieceStatus {

        side == .microphone ? microphoneTrack : callTrack
    }

    func capture(for side: SessionSide) -> PieceStatus {

        side == .microphone ? microphoneCapture : callCapture
    }
}

/// Dispatches effects to exactly one supplied dependency and maps its result.
public final class SessionEffectHandler: Sendable {

    private let folder: any SessionFolder
    private let processes: any SessionProcesses
    private let microphoneCapture: any SessionCapture
    private let callCapture: any SessionCapture
    private let microphoneTrack: any SessionTrackFile
    private let callTrack: any SessionTrackFile
    private let callText: any SessionCallText
    private let transcript: any SessionTranscript

    public init(
        folder: any SessionFolder,
        processes: any SessionProcesses,
        microphoneCapture: any SessionCapture,
        callCapture: any SessionCapture,
        microphoneTrack: any SessionTrackFile,
        callTrack: any SessionTrackFile,
        callText: any SessionCallText,
        transcript: any SessionTranscript
    ) {

        self.folder = folder
        self.processes = processes
        self.microphoneCapture = microphoneCapture
        self.callCapture = callCapture
        self.microphoneTrack = microphoneTrack
        self.callTrack = callTrack
        self.callText = callText
        self.transcript = transcript
    }

    public func handle(_ effect: SessionEffect) async -> SessionEvent {

        switch effect {
        case .createFolder:
            return await result { try await self.folder.create() }.map(SessionEvent.folderFinished)
        case .selectProcesses:
            do { return .processesFinished(selection: try await processes.select(), error: nil) }
            catch { return .processesFinished(selection: nil, error: String(describing: error)) }
        case let .openTrack(side):
            let result = await result { try await self.track(for: side).open() }
            return .trackFinished(side, error: result)
        case .openTranscript:
            return await result { try await self.transcript.open() }.map(SessionEvent.transcriptFinished)
        case let .startCallText(enabled):
            return await result { try await self.callText.start(enabled: enabled) }.map(SessionEvent.callTextFinished)
        case let .startCapture(side, selection):
            let result = await result { try await self.capture(for: side).start(selection: selection) }
            return .captureFinished(side, error: result)
        case let .stopCapture(side):
            let result = await result { try await self.capture(for: side).stop() }
            return .captureStopped(side, error: result)
        case let .closeTrack(side):
            let result = await result { try await self.track(for: side).close() }
            return .trackClosed(side, error: result)
        case .stopCallText:
            return await result { try await self.callText.stop() }.map(SessionEvent.callTextStopped)
        case .closeTranscript:
            return await result { try await self.transcript.close() }.map(SessionEvent.transcriptClosed)
        case let .setLiveText(enabled):
            let result = await result { try await self.callText.setEnabled(enabled) }
            return .liveTextSet(enabled: enabled, error: result)
        }
    }

    public func machine(initial: SessionState = .init()) -> Machine<SessionState, SessionEvent, SessionEffect> {

        let handler = self
        return Machine(initial: initial, reduce: SessionReducer.reduce, handle: { effect in
            await handler.handle(effect)
        })
    }

    private func capture(for side: SessionSide) -> any SessionCapture {

        side == .microphone ? microphoneCapture : callCapture
    }

    private func track(for side: SessionSide) -> any SessionTrackFile {

        side == .microphone ? microphoneTrack : callTrack
    }

    private func result(_ operation: @escaping () async throws -> Void) async -> String? {

        do { try await operation(); return nil }
        catch { return String(describing: error) }
    }
}

/// One recording's machine, assembled from a reducer and its handler.
public final class Session: Sendable {

    public let machine: Machine<SessionState, SessionEvent, SessionEffect>

    public init(handler: SessionEffectHandler, initial: SessionState = .init()) {

        machine = handler.machine(initial: initial)
    }

    public nonisolated func send(_ event: SessionEvent) {

        machine.send(event)
    }

    public func states() async -> AsyncStream<SessionState> {

        await machine.states()
    }

    public func snapshot() async -> SessionState {

        await machine.snapshot()
    }

    public func end() async {

        await machine.end()
    }
}

private extension Optional where Wrapped == String {

    func map(_ make: (String?) -> SessionEvent) -> SessionEvent {

        make(self)
    }
}
