import Machine
import Synchronization

/// The two destinations in one recording.
public enum SessionSide: Hashable, Sendable {

    case microphone
    case call
}

/// An opaque choice owned by the process-selection adapter.
public struct SessionProcessSelection: Equatable, Sendable {

    public let id: String

    public init(id: String) {

        self.id = id
    }
}

public enum SessionCallCaptureSelection: Equatable, Sendable {

    case chosen(SessionProcessSelection)
    case everyAppButAudelin
}

/// An opaque destination passed from folder creation to each file opener.
public struct SessionCallFolder: Equatable, Sendable {

    public let id: String

    public init(id: String) {

        self.id = id
    }
}

public protocol SessionFolder: Sendable {

    func create() async throws -> SessionCallFolder
}

public protocol SessionProcesses: Sendable {

    func select() async throws -> SessionProcessSelection
}

public protocol SessionMicrophoneCapture: Sendable {

    func start() async throws
    func stop() async throws
}

public protocol SessionCallCapture: Sendable {

    func start(selection: SessionCallCaptureSelection) async throws
    func stop() async throws
}

public protocol SessionTrackFile: Sendable {

    func open(in folder: SessionCallFolder) async throws
    func close() async throws
}

public protocol SessionCallText: Sendable {

    func start(enabled: Bool) async throws
    func setEnabled(_ enabled: Bool) async throws
    func stop() async throws
}

public protocol SessionTranscript: Sendable {

    func open(in folder: SessionCallFolder) async throws
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

    public enum Piece: Hashable, Sendable {

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
    }

    public enum Health: Equatable, Sendable {

        case fine
        case failed(String)
        case accessLost
    }

    public struct LiveTextRequest: Equatable, Sendable {

        public let id: UInt64
        public let enabled: Bool

        public init(id: UInt64, enabled: Bool) {

            self.id = id
            self.enabled = enabled
        }
    }

    public var health: [Piece: Health]
    public var wantedLiveText: Bool
    public var liveTextRequestID: UInt64
    public var pendingLiveText: LiveTextRequest?
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
        health: [Piece: Health] = [:],
        wantedLiveText: Bool = false,
        liveTextRequestID: UInt64 = 0,
        pendingLiveText: LiveTextRequest? = nil,
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

        self.health = health
        self.wantedLiveText = wantedLiveText
        self.liveTextRequestID = liveTextRequestID
        self.pendingLiveText = pendingLiveText
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

    public func health(of piece: Piece) -> Health {

        health[piece] ?? .fine
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
    case liveTextSet(request: SessionState.LiveTextRequest, error: String?)
    case callTextStatusChanged(SessionState.LiveText)
    case pieceFailed(SessionState.Piece, error: String)
}

public enum SessionEffect: Equatable, Sendable {

    case createFolder
    case selectProcesses
    case openTrack(SessionSide)
    case openTranscript
    case startCallText(enabled: Bool)
    case startMicrophoneCapture
    case startCallCapture(selection: SessionCallCaptureSelection)
    case stopCapture(SessionSide)
    case closeTrack(SessionSide)
    case stopCallText
    case closeTranscript
    case setLiveText(SessionState.LiveTextRequest)
}

/// Purely orders one bring-up or bring-down operation at a time.
public enum SessionReducer {

    public static func reduce(_ state: SessionState, _ event: SessionEvent) -> (SessionState, SessionEffect?) {

        var state = state
        switch event {
        case let .begin(enabled):
            guard state.phase == .idle else { return (state, nil) }
            state.phase = .bringingUp
            state.wantedLiveText = enabled
            state.folder = .starting
            return (state, .createFolder)

        case .end:
            guard state.phase != .ended && state.phase != .ending else { return (state, nil) }
            state.phase = .ending
            return nextDown(&state)

        case let .liveTextChanged(enabled), let .preferenceChanged(enabled):
            guard state.phase == .recording else { return (state, nil) }
            state.wantedLiveText = enabled
            state.liveTextRequestID += 1
            guard state.pendingLiveText == nil else { return (state, nil) }
            return switchLiveText(&state)

        case let .accessChanged(side, available):
            guard state.phase == .bringingUp || state.phase == .recording || state.phase == .ending,
                  !available else { return (state, nil) }
            state.health[.access(side)] = .accessLost
            addFailure(&state, .init(piece: side.name + " access", message: "access lost"))
            updateRecordability(&state)
            return (state, nil)

        case let .pieceFailed(piece, error):
            guard state.phase == .bringingUp || state.phase == .recording || state.phase == .ending else { return (state, nil) }
            recordFailure(&state, piece, error)
            if piece == .folder { state.cannotRecord = "folder: \(error)" }
            else { updateRecordability(&state) }
            return (state, nil)

        case let .folderFinished(error):
            guard state.folder == .starting else { return (state, nil) }
            state.folder = error == nil ? .up : .down
            if let error {
                recordFailure(&state, .folder, error)
                state.cannotRecord = "folder: \(error)"
            }
            if state.phase == .ending { return nextDown(&state) }
            guard error == nil, state.health(of: .folder) == .fine else { return (state, nil) }
            state.processes = .starting
            return (state, .selectProcesses)

        case let .processesFinished(selection, error):
            guard state.processes == .starting else { return (state, nil) }
            state.processes = error == nil ? .up : .down
            if let error { recordFailure(&state, .processes, error) }
            state.processSelection = selection
            if state.phase == .ending { return nextDown(&state) }
            state.microphoneTrack = .starting
            return (state, .openTrack(.microphone))

        case let .trackFinished(side, error):
            guard state.track(for: side) == .starting else { return (state, nil) }
            setTrack(&state, side, error == nil ? .up : .down)
            if let error { recordFailure(&state, .track(side), error) }
            if state.phase == .ending { return nextDown(&state) }
            if side == .microphone {
                state.callTrack = .starting
                return (state, .openTrack(.call))
            }
            state.transcript = .starting
            return (state, .openTranscript)

        case let .transcriptFinished(error):
            guard state.transcript == .starting else { return (state, nil) }
            state.transcript = error == nil ? .up : .down
            if let error { recordFailure(&state, .transcript, error) }
            if state.phase == .ending { return nextDown(&state) }
            state.callText = .starting
            return (state, .startCallText(enabled: state.wantedLiveText))

        case let .callTextFinished(error):
            guard state.callText == .starting else { return (state, nil) }
            state.callText = error == nil ? .up : .down
            if let error { recordFailure(&state, .callText, error) }
            if state.phase == .ending { return nextDown(&state) }
            if state.health(of: .access(.microphone)) != .fine || state.health(of: .capture(.microphone)) != .fine {
                return startCallCaptureOrFinish(&state)
            }
            state.microphoneCapture = .starting
            return (state, .startMicrophoneCapture)

        case let .captureFinished(side, error):
            guard state.capture(for: side) == .starting else { return (state, nil) }
            setCapture(&state, side, error == nil ? .up : .down)
            if let error { recordFailure(&state, .capture(side), error) }
            if state.phase == .ending { return nextDown(&state) }
            if side == .microphone { return startCallCaptureOrFinish(&state) }
            return finishCaptureBringUp(&state)

        case let .captureStopped(side, error):
            guard state.capture(for: side) == .stopping else { return (state, nil) }
            setCapture(&state, side, .closed)
            if let error { recordFailure(&state, .capture(side), error) }
            return nextDown(&state)

        case let .trackClosed(side, error):
            guard state.track(for: side) == .stopping else { return (state, nil) }
            setTrack(&state, side, .closed)
            if let error { recordFailure(&state, .track(side), error) }
            return nextDown(&state)

        case let .callTextStopped(error):
            guard state.callText == .stopping else { return (state, nil) }
            state.callText = .closed
            if let error { recordFailure(&state, .callText, error) }
            return nextDown(&state)

        case let .transcriptClosed(error):
            guard state.transcript == .stopping else { return (state, nil) }
            state.transcript = .closed
            if let error { recordFailure(&state, .transcript, error) }
            return nextDown(&state)

        case let .liveTextSet(request, error):
            guard state.pendingLiveText == request else { return (state, nil) }
            state.pendingLiveText = nil
            if request.id == state.liveTextRequestID {
                if let error { recordFailure(&state, .callText, error) }
            } else if state.phase == .recording {
                return switchLiveText(&state)
            }
            if state.phase == .ending { return nextDown(&state) }
            return (state, nil)

        case let .callTextStatusChanged(status):
            guard state.phase == .bringingUp || state.phase == .recording,
                  state.callText == .starting || state.callText == .up else { return (state, nil) }
            guard status == .off || state.wantedLiveText else { return (state, nil) }
            state.liveText = status
            return (state, nil)
        }
    }

    private static func switchLiveText(_ state: inout SessionState) -> (SessionState, SessionEffect?) {

        let request = SessionState.LiveTextRequest(id: state.liveTextRequestID, enabled: state.wantedLiveText)
        state.pendingLiveText = request
        return (state, .setLiveText(request))
    }

    private static func nextDown(_ state: inout SessionState) -> (SessionState, SessionEffect?) {

        guard state.phase == .ending else { return (state, nil) }
        let pieces = [state.folder, state.processes, state.microphoneCapture, state.callCapture,
                      state.microphoneTrack, state.callTrack, state.callText, state.transcript]
        guard !pieces.contains(.starting), !pieces.contains(.stopping), state.pendingLiveText == nil else { return (state, nil) }
        if state.microphoneCapture == .up { state.microphoneCapture = .stopping; return (state, .stopCapture(.microphone)) }
        if state.callCapture == .up { state.callCapture = .stopping; return (state, .stopCapture(.call)) }
        if state.microphoneTrack == .up { state.microphoneTrack = .stopping; return (state, .closeTrack(.microphone)) }
        if state.callTrack == .up { state.callTrack = .stopping; return (state, .closeTrack(.call)) }
        if state.callText == .up { state.callText = .stopping; return (state, .stopCallText) }
        if state.transcript == .up { state.transcript = .stopping; return (state, .closeTranscript) }
        if state.folder == .up { state.folder = .closed }
        if state.processes == .up { state.processes = .closed }
        state.phase = .ended
        return (state, nil)
    }

    private static func addFailure(_ state: inout SessionState, _ failure: SessionFailure) {

        state.failures.append(failure)
    }

    private static func recordFailure(_ state: inout SessionState, _ piece: SessionState.Piece, _ error: String) {

        state.health[piece] = .failed(error)
        addFailure(&state, .init(piece: piece.name, message: error))
    }

    private static func hasUsableTrack(_ state: SessionState) -> Bool {

        [SessionSide.microphone, .call].contains { side in
            state.track(for: side) == .up && state.capture(for: side) == .up
                && state.health(of: .track(side)) == .fine && state.health(of: .capture(side)) == .fine
                && state.health(of: .access(side)) == .fine
        }
    }

    private static func updateRecordability(_ state: inout SessionState) {

        if !hasUsableTrack(state) && state.phase == .recording {
            state.cannotRecord = "no track can record"
            state.phase = .bringingUp
        }
    }

    private static func startCallCaptureOrFinish(_ state: inout SessionState) -> (SessionState, SessionEffect?) {

        if state.callCapture == .down && state.health(of: .access(.call)) == .fine && state.health(of: .capture(.call)) == .fine {
            state.callCapture = .starting
            let selection = state.processSelection.map(SessionCallCaptureSelection.chosen) ?? .everyAppButAudelin
            return (state, .startCallCapture(selection: selection))
        }
        return finishCaptureBringUp(&state)
    }

    private static func finishCaptureBringUp(_ state: inout SessionState) -> (SessionState, SessionEffect?) {

        if hasUsableTrack(state) { state.phase = .recording }
        else {
            state.cannotRecord = "no track can record"
            state.phase = .bringingUp
        }
        return (state, nil)
    }

    private static func setTrack(_ state: inout SessionState, _ side: SessionSide, _ status: SessionState.PieceStatus) {

        if side == .microphone { state.microphoneTrack = status } else { state.callTrack = status }
    }

    private static func setCapture(_ state: inout SessionState, _ side: SessionSide, _ status: SessionState.PieceStatus) {

        if side == .microphone { state.microphoneCapture = status } else { state.callCapture = status }
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
    private let microphoneCapture: any SessionMicrophoneCapture
    private let callCapture: any SessionCallCapture
    private let microphoneTrack: any SessionTrackFile
    private let callTrack: any SessionTrackFile
    private let callText: any SessionCallText
    private let transcript: any SessionTranscript
    private let madeFolder = Mutex<SessionCallFolder?>(nil)

    public init(
        folder: any SessionFolder,
        processes: any SessionProcesses,
        microphoneCapture: any SessionMicrophoneCapture,
        callCapture: any SessionCallCapture,
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
            return await result {
                let made = try await self.folder.create()
                self.madeFolder.withLock { $0 = made }
            }.map(SessionEvent.folderFinished)
        case .selectProcesses:
            do { return .processesFinished(selection: try await processes.select(), error: nil) }
            catch { return .processesFinished(selection: nil, error: String(describing: error)) }
        case let .openTrack(side):
            let result = await result { try await self.track(for: side).open(in: self.callFolder()) }
            return .trackFinished(side, error: result)
        case .openTranscript:
            return await result { try await self.transcript.open(in: self.callFolder()) }.map(SessionEvent.transcriptFinished)
        case let .startCallText(enabled):
            return await result { try await self.callText.start(enabled: enabled) }.map(SessionEvent.callTextFinished)
        case .startMicrophoneCapture:
            let result = await result { try await self.microphoneCapture.start() }
            return .captureFinished(.microphone, error: result)
        case let .startCallCapture(selection):
            let result = await result { try await self.callCapture.start(selection: selection) }
            return .captureFinished(.call, error: result)
        case let .stopCapture(side):
            let result = await result {
                if side == .microphone { try await self.microphoneCapture.stop() }
                else { try await self.callCapture.stop() }
            }
            return .captureStopped(side, error: result)
        case let .closeTrack(side):
            let result = await result { try await self.track(for: side).close() }
            return .trackClosed(side, error: result)
        case .stopCallText:
            return await result { try await self.callText.stop() }.map(SessionEvent.callTextStopped)
        case .closeTranscript:
            return await result { try await self.transcript.close() }.map(SessionEvent.transcriptClosed)
        case let .setLiveText(request):
            let result = await result { try await self.callText.setEnabled(request.enabled) }
            return .liveTextSet(request: request, error: result)
        }
    }

    public func machine(initial: SessionState = .init()) -> Machine<SessionState, SessionEvent, SessionEffect> {

        let handler = self
        return Machine(initial: initial, reduce: SessionReducer.reduce, handle: { effect in
            await handler.handle(effect)
        })
    }

    private func callFolder() throws -> SessionCallFolder {

        guard let folder = madeFolder.withLock({ $0 }) else {
            throw SessionFailure(piece: "folder", message: "folder has not been created")
        }
        return folder
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
