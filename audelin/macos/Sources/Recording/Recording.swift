public enum RecordingCondition: CaseIterable, Hashable, Sendable {

    case microphoneAccess
    case callAudioAccess
    case callsFolder
    case room
}

public enum RecordingFault: CaseIterable, Hashable, Sendable {

    case microphone, callAudio, diskFull
}

/// The calls-folder claim's answer to Recording's take.
public enum CallsFolderAnswer: Equatable, Sendable {

    case granted(token: UInt64)
    /// A folder move has the folder: the start waits for the move to end.
    case refusedByMove
    /// Another holder, such as a relaunch, has the folder: the start ends.
    case refused
}

public enum RecordingSessionReport: Equatable, Sendable {

    case ended
}

/// What the current session's pieces show, as Recording reads them.
public struct RecordingSessionStatus: Equatable, Sendable {

    /// The call the pieces created, once its folder exists.
    public var callID: String?
    /// The pieces record.
    public var recording: Bool
    public var cannotRecord: String?
    public var faults: Set<RecordingFault>
    public var callSilent: Bool

    public init(callID: String? = nil, recording: Bool = false, cannotRecord: String? = nil,
                faults: Set<RecordingFault> = [], callSilent: Bool = false) {

        self.callID = callID
        self.recording = recording
        self.cannotRecord = cannotRecord
        self.faults = faults
        self.callSilent = callSilent
    }
}

public struct RecordingState: Equatable, Sendable {

    public enum Phase: Equatable, Sendable {

        case idle
        case beginning
        case recording
        case ending
    }

    public enum Origin: Equatable, Sendable {

        case call
        case hand
    }

    public struct ActiveSession: Equatable, Sendable {

        public let id: UInt64
        public let origin: Origin

        public init(id: UInt64, origin: Origin) {

            self.id = id
            self.origin = origin
        }
    }

    public var storageReserved = false
    /// Each storage reservation request's decision, kept until its caller has read it.
    public var reservations: [UInt64: Bool] = [:]
    public var pendingStart: Origin?
    public var automatic: Bool
    public var missing: Set<RecordingCondition>
    public var phase: Phase = .idle
    public var session: ActiveSession?
    public var sessionBeganDuringCall = false
    public var callOn = false
    public var heldForCall = false
    public var pendingCall = false
    public var lastSessionID: UInt64 = 0
    public var cannotRecord: String?
    public var faults: Set<RecordingFault> = []
    public var callID: String?
    public var callSilent = false
    /// Set by a shutdown; `settled` once no session runs, and no session begins after it.
    public var shutdown: Shutdown?
    /// The work running for the current session, if any.
    public var stage: Stage?
    /// The current session's pieces, as the Session reducer leaves them.
    public var pieces: SessionState?
    /// The calls-folder claim's token while the current session holds it.
    public var folderToken: UInt64?
    /// A folder move holds the calls folder, as RecordingConditions last said.
    public var folderMoving = false
    /// How many moves have ended, as RecordingConditions told.
    public var moveEnds: UInt64 = 0
    /// `moveEnds` when the current take began: a move that ended since then makes a move's refusal stale.
    public var claimSince: UInt64 = 0

    /// One session's line of work: claim the calls folder, get call audio, bring the pieces up and
    /// down, release call audio, release the calls folder.
    public enum Stage: Equatable, Sendable {

        case claiming
        case preparing
        /// The pieces are coming up, running or going down, as `pieces` says.
        case pieces
        case releasing
        case releasingClaim
    }

    public enum Shutdown: Equatable, Sendable {

        case requested
        case settled
    }

    /// Conditions start unknown, so a start waits for each to be reported available.
    public init(automatic: Bool = false, missing: Set<RecordingCondition> = Set(RecordingCondition.allCases), storageReserved: Bool = false, pendingStart: Origin? = nil) {

        self.automatic = automatic
        self.storageReserved = storageReserved
        self.pendingStart = pendingStart
        self.missing = missing
    }
}

public enum RecordingEvent: Equatable, Sendable {

    case callStarted
    case callEnded
    case userStart
    case reserveStorage(request: UInt64), reservationAnswered(request: UInt64)
    case releaseStorage
    case userStop
    case automaticChanged(Bool)
    case conditionChanged(RecordingCondition, available: Bool)
    /// A folder move holds the calls folder; the next calls-folder condition ends the move.
    case callsFolderMoving
    /// The calls-folder claim answered the session's take.
    case folderClaimed(id: UInt64, CallsFolderAnswer)
    /// Call audio was released for the session.
    case callAudioReleased(id: UInt64)
    case sessionReported(id: UInt64, RecordingSessionReport)
    case shutdown
    /// Call audio was checked and reserved for the session, or could not be; live text as preferred then.
    case callAudioPrepared(id: UInt64, ready: Bool, liveText: Bool)
    /// A result or report of the session's pieces.
    case session(id: UInt64, SessionEvent)
}

public enum RecordingEffect: Equatable, Sendable {

    case claimFolder(id: UInt64)
    case releaseFolder(id: UInt64, token: UInt64)
    case prepareCallAudio(id: UInt64)
    case releaseCallAudio(id: UInt64)
    /// Work for one of the session's pieces.
    case session(id: UInt64, SessionEffect)
}

public struct RecordingReducer: Sendable {

    private let session: @Sendable (SessionState, SessionEvent) -> (SessionState, SessionEffect?)
    private let status: @Sendable (SessionState) -> RecordingSessionStatus

    /// `session` advances the current session's pieces; `status` reads what they show.
    public init(session: @escaping @Sendable (SessionState, SessionEvent) -> (SessionState, SessionEffect?),
                status: @escaping @Sendable (SessionState) -> RecordingSessionStatus) {

        self.session = session
        self.status = status
    }

    public func reduce(_ state: RecordingState, _ event: RecordingEvent) -> (RecordingState, RecordingEffect?) {

        var state = state
        if let id = state.session?.id {
            switch event {
            case let .folderClaimed(reported, answer) where reported == id && state.stage == .claiming:
                return claimed(state, id, answer)
            case let .callAudioReleased(reported) where reported == id && state.stage == .releasing:
                guard let token = state.folderToken else { return advance(Self.policy(state, .sessionReported(id: id, .ended))) }
                state.stage = .releasingClaim
                return (state, .releaseFolder(id: id, token: token))
            case let .callAudioPrepared(reported, ready, liveText) where reported == id && state.stage == .preparing:
                if !ready { state.missing.insert(.callAudioAccess) }
                guard ready, state.phase != .ending else { return Self.release(&state, id) }
                state.stage = .pieces
                return advancePieces(state, id, .begin(liveText: liveText))
            case let .session(reported, event) where reported == id && state.stage == .pieces:
                return advancePieces(state, id, event)
            case .callAudioPrepared, .session, .folderClaimed, .callAudioReleased:
                return (state, nil)
            default:
                break
            }
        } else {
            switch event {
            case .callAudioPrepared, .session, .folderClaimed, .callAudioReleased: return (state, nil)
            default: break
            }
        }
        return advance(Self.policy(state, event))
    }

    /// A grant goes on to call audio, or is released at once after a stop; a move's refusal keeps
    /// the start waiting, or takes again if that move has already ended; any other refusal ends it.
    private func claimed(_ state: RecordingState, _ id: UInt64, _ answer: CallsFolderAnswer) -> (RecordingState, RecordingEffect?) {

        var state = state
        switch answer {
        case let .granted(token):
            state.folderToken = token
            if state.phase == .ending {
                state.stage = .releasingClaim
                return (state, .releaseFolder(id: id, token: token))
            }
            state.stage = .preparing
            return (state, .prepareCallAudio(id: id))
        case .refusedByMove where state.phase != .ending:
            if state.moveEnds > state.claimSince, !state.folderMoving {
                state.claimSince = state.moveEnds
                return (state, .claimFolder(id: id))
            }
            state.pendingStart = state.session?.origin
        case .refusedByMove, .refused:
            break
        }
        return advance(Self.policy(state, .sessionReported(id: id, .ended)))
    }

    /// Starts the next piece of the current session's work, one at a time.
    private func advance(_ state: RecordingState) -> (RecordingState, RecordingEffect?) {

        var state = state
        guard let id = state.session?.id else { return (state, nil) }
        switch state.stage {
        case nil where state.phase == .ending:
            // Ended before any work started: nothing to bring down or release.
            return advance(Self.policy(state, .sessionReported(id: id, .ended)))
        case nil where state.phase == .beginning || state.phase == .recording:
            state.stage = .claiming
            state.claimSince = state.moveEnds
            return (state, .claimFolder(id: id))
        case .pieces? where state.phase == .ending && !Self.goingDown(state.pieces):
            return advancePieces(state, id, .end)
        default:
            return (state, nil)
        }
    }

    /// Reduces one event of the pieces, takes in what they show, and brings them down once Recording ends.
    private func advancePieces(_ state: RecordingState, _ id: UInt64, _ event: SessionEvent) -> (RecordingState, RecordingEffect?) {

        var state = state
        var (pieces, effect) = session(state.pieces ?? SessionState(), event)
        state.pieces = pieces
        state = Self.take(status(pieces), into: state)
        if state.phase == .ending, !Self.goingDown(pieces), effect == nil {
            // Work just started holds the bring-down until its result, which comes back here.
            (pieces, effect) = session(pieces, .end)
            state.pieces = pieces
        }
        if pieces.phase == .ended { return Self.release(&state, id) }
        return (state, effect.map { .session(id: id, $0) })
    }

    private static func goingDown(_ pieces: SessionState?) -> Bool {

        pieces?.phase == .ending || pieces?.phase == .ended
    }

    private static func release(_ state: inout RecordingState, _ id: UInt64) -> (RecordingState, RecordingEffect?) {

        state.stage = .releasing
        return (state, .releaseCallAudio(id: id))
    }

    private static func take(_ status: RecordingSessionStatus, into state: RecordingState) -> RecordingState {

        var state = state
        if let callID = status.callID { state.callID = callID }
        if let reason = status.cannotRecord, state.cannotRecord == nil {
            state.cannotRecord = reason
            return end(&state)
        }
        if status.recording, state.phase == .beginning { state.phase = .recording }
        // Faults and silence count once the pieces record; a fault stays until the session ends.
        guard state.phase == .recording || state.phase == .ending else { return state }
        state.faults.formUnion(status.faults)
        state.callSilent = status.callSilent
        return state
    }

    private static func policy(_ state: RecordingState, _ event: RecordingEvent) -> RecordingState {

        var state = state
        switch event {
        case .callAudioPrepared, .session, .folderClaimed, .callAudioReleased:
            return state
        case .shutdown:
            guard state.shutdown == nil else { return state }
            state.pendingStart = nil
            state.pendingCall = false
            state = end(&state)
            state.shutdown = state.phase == .idle ? .settled : .requested
            return state
        case let .reserveStorage(request):
            guard state.reservations[request] == nil else { return state }
            let granted = state.phase == .idle && !state.storageReserved
            if granted { state.storageReserved = true }
            state.reservations[request] = granted
            return state
        case let .reservationAnswered(request):
            state.reservations[request] = nil
            return state
        case .releaseStorage:
            state.storageReserved = false
            if let origin = state.pendingStart { return begin(&state, origin: origin) }
            return state
        case .callStarted:
            guard !state.callOn else { return state }
            state.callOn = true
            guard state.automatic, !state.heldForCall else { return state }
            if state.phase == .ending {
                state.pendingCall = true
                return state
            }
            if state.storageReserved || state.folderMoving, state.shutdown == nil {
                if state.pendingStart == nil { state.pendingStart = .call }
                return state
            }
            return begin(&state, origin: .call)

        case .callEnded:
            guard state.callOn else { return state }
            state.callOn = false
            state.heldForCall = false
            state.pendingCall = false
            if state.pendingStart == .call { state.pendingStart = nil }
            guard state.sessionBeganDuringCall else { return state }
            return end(&state)

        case .userStart:
            if state.storageReserved || state.folderMoving, state.shutdown == nil { state.pendingStart = .hand; return state }
            return begin(&state, origin: .hand)

        case .userStop:
            state.pendingStart = nil
            if state.callOn { state.heldForCall = true }
            state.pendingCall = false
            return end(&state)

        case let .automaticChanged(enabled):
            state.automatic = enabled
            if !enabled {
                state.pendingCall = false
                if state.pendingStart == .call { state.pendingStart = nil }
            }
            return state

        case .callsFolderMoving:
            state.folderMoving = true
            return state

        case let .conditionChanged(condition, available):
            if condition == .callsFolder, state.folderMoving {
                // The move is over: a lost folder refuses the start that waited for it.
                state.folderMoving = false
                state.moveEnds += 1
                if !available { state.pendingStart = nil }
            }
            if available { state.missing.remove(condition) }
            else { state.missing.insert(condition) }
            if !available && (condition == .callsFolder || condition == .room) {
                return end(&state)
            }
            if let origin = state.pendingStart { return begin(&state, origin: origin) }
            return state

        case let .sessionReported(id, report):
            guard state.session?.id == id else { return state }
            switch report {
            case .ended:
                state.stage = nil
                state.pieces = nil
                state.folderToken = nil
                state.phase = .idle
                state.callSilent = false
                state.callID = nil
                state.session = nil
                state.sessionBeganDuringCall = false
                let resumeCall = state.pendingCall && state.callOn && state.automatic && !state.heldForCall
                state.pendingCall = false
                if state.shutdown == .requested { state.shutdown = .settled }
                if resumeCall { return begin(&state, origin: .call) }
                return state
            }
        }
    }

    private static func begin(_ state: inout RecordingState, origin: RecordingState.Origin) -> RecordingState {

        // Call-audio evidence is refreshed while preparing, including when the last reading failed.
        guard state.shutdown == nil, !state.storageReserved, !state.folderMoving, state.phase == .idle, state.missing.subtracting([.callAudioAccess]).isEmpty else { return state }
        state.pendingStart = nil
        state.callID = nil
        state.lastSessionID += 1
        state.session = .init(id: state.lastSessionID, origin: origin)
        // A hand start during a call belongs to that call too: Audelin may have missed its start.
        state.sessionBeganDuringCall = state.callOn
        state.phase = .beginning
        state.cannotRecord = nil
        state.faults = []
        state.callSilent = false
        return state
    }

    private static func end(_ state: inout RecordingState) -> RecordingState {

        guard state.phase == .beginning || state.phase == .recording,
              state.session != nil else { return state }
        state.phase = .ending
        return state
    }
}

/// Dispatches each Recording effect to its collaborator and answers with the event it ends in.
public final class RecordingEffectHandler: Sendable {

    private let claimFolder: @Sendable () async -> CallsFolderAnswer
    private let releaseFolder: @Sendable (UInt64) async -> Void
    private let prepareCallAudio: @Sendable () async -> Bool
    private let liveText: @Sendable () -> Bool
    private let releaseCallAudio: @Sendable () async -> Void
    private let runPiece: @Sendable (UInt64, SessionEffect) async -> SessionEvent

    /// `liveText` reads the preference a session begins with; `runPiece` runs one piece's work
    /// for the session with that id and answers with its result; `claimFolder` takes the calls-folder
    /// claim for a recording and `releaseFolder` releases the token it granted.
    public init(claimFolder: @escaping @Sendable () async -> CallsFolderAnswer,
                releaseFolder: @escaping @Sendable (UInt64) async -> Void,
                prepareCallAudio: @escaping @Sendable () async -> Bool,
                liveText: @escaping @Sendable () -> Bool,
                releaseCallAudio: @escaping @Sendable () async -> Void,
                runPiece: @escaping @Sendable (UInt64, SessionEffect) async -> SessionEvent) {

        self.claimFolder = claimFolder
        self.releaseFolder = releaseFolder
        self.prepareCallAudio = prepareCallAudio
        self.liveText = liveText
        self.releaseCallAudio = releaseCallAudio
        self.runPiece = runPiece
    }

    public func handle(_ effect: RecordingEffect) async -> RecordingEvent {

        switch effect {
        case let .claimFolder(id):
            return .folderClaimed(id: id, await claimFolder())
        case let .releaseFolder(id, token):
            await releaseFolder(token)
            return .sessionReported(id: id, .ended)
        case let .prepareCallAudio(id):
            let ready = await prepareCallAudio()
            return .callAudioPrepared(id: id, ready: ready, liveText: liveText())
        case let .releaseCallAudio(id):
            await releaseCallAudio()
            return .callAudioReleased(id: id)
        case let .session(id, effect):
            return .session(id: id, await runPiece(id, effect))
        }
    }
}
