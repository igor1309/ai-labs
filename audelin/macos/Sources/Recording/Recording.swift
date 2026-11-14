import Synchronization

public enum RecordingCondition: CaseIterable, Hashable, Sendable {

    case microphoneAccess
    case callAudioAccess
    case callsFolder
    case room
}

public enum RecordingFault: CaseIterable, Hashable, Sendable {

    case microphone, callAudio, diskFull
}

public enum RecordingSessionReport: Equatable, Sendable {

    case ended
}

/// What a running Session currently shows, translated for Recording.
public struct RecordingSessionStatus: Equatable, Sendable {

    /// The call the Session created, once its folder exists.
    public var callID: String?
    /// The Session records both sides.
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

/// Compose begins and ends Sessions and translates their later reports into events.
public protocol RecordingSession: Sendable {

    /// Returns once the Session exists and its begin is queued; how it goes arrives as status.
    func begin(id: UInt64) async

    /// Returns only when this Session has ended, including any pending bring-up.
    func end(id: UInt64) async
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
    case sessionReported(id: UInt64, RecordingSessionReport)
    case sessionChanged(id: UInt64, RecordingSessionStatus)
    case shutdown
}

public enum RecordingReducer {

    public static func reduce(_ state: RecordingState, _ event: RecordingEvent) -> RecordingState {

        var state = state
        switch event {
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
            if state.storageReserved, state.shutdown == nil {
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
            if state.storageReserved, state.shutdown == nil { state.pendingStart = .hand; return state }
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

        case let .conditionChanged(condition, available):
            if available { state.missing.remove(condition) }
            else { state.missing.insert(condition) }
            if !available && (condition == .callsFolder || condition == .room) {
                return end(&state)
            }
            if let origin = state.pendingStart { return begin(&state, origin: origin) }
            return state

        case let .sessionChanged(id, status):
            guard state.session?.id == id, state.phase != .idle else {
                // A session that ended before Recording heard why still names the reason.
                if state.phase == .idle, id != 0, id == state.lastSessionID, let reason = status.cannotRecord {
                    state.cannotRecord = reason
                }
                return state
            }
            if let callID = status.callID { state.callID = callID }
            if let reason = status.cannotRecord, state.cannotRecord == nil {
                state.cannotRecord = reason
                return end(&state)
            }
            if status.recording, state.phase == .beginning { state.phase = .recording }
            // Faults and silence count once the Session records; a fault stays until the session ends.
            guard state.phase == .recording || state.phase == .ending else { return state }
            state.faults.formUnion(status.faults)
            state.callSilent = status.callSilent
            return state

        case let .sessionReported(id, report):
            guard state.session?.id == id else { return state }
            switch report {
            case .ended:
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

        // Call-audio evidence is refreshed by the doer, including when the last reading failed.
        guard state.shutdown == nil, !state.storageReserved, state.phase == .idle, state.missing.subtracting([.callAudioAccess]).isEmpty else { return state }
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

/// Makes the Session follow Recording's state: begins each session it sees once and ends it once
/// its phase is `.ending`, sending each Session report back.
public final class RecordingDoer: Sendable {

    private struct Memory {

        var lastBegun: UInt64 = 0
        var lastEnded: UInt64 = 0
        var current: RecordingState?
        var preparation: Task<Bool, Never>?
        var release: Task<Void, Never>?
        var released: UInt64 = 0
    }

    private let session: any RecordingSession
    private let send: @Sendable (RecordingEvent) async -> Void
    private let callAudioReady: @Sendable () async -> Bool
    private let callAudioReleased: @Sendable () async -> Void
    private let memory = Mutex(Memory())

    public init(session: any RecordingSession,
                callAudioReady: @escaping @Sendable () async -> Bool,
                callAudioReleased: @escaping @Sendable () async -> Void,
                send: @escaping @Sendable (RecordingEvent) async -> Void) {

        self.session = session
        self.send = send
        self.callAudioReady = callAudioReady
        self.callAudioReleased = callAudioReleased
    }

    /// Observations may merge changes, so a session first seen recording or ending is still begun.
    public func act(on state: RecordingState) {

        memory.withLock { memory in
            if let previous = memory.current?.session?.id, previous != state.session?.id {
                release(previous, memory: &memory)
            }
            memory.current = state
            guard let id = state.session?.id else { return }
            if id > memory.lastBegun {
                memory.lastBegun = id
                let previousRelease = memory.release
                let initiallyEnding = state.phase == .ending
                let preparation = Task { [self] in
                    await previousRelease?.value
                    let ready = await callAudioReady()
                    if !ready { await send(.conditionChanged(.callAudioAccess, available: false)) }
                    let stillWanted = self.memory.withLock {
                        $0.current?.session?.id == id && ($0.current?.phase != .ending || initiallyEnding)
                    }
                    guard ready && stillWanted else {
                        await release(id)
                        await send(.sessionReported(id: id, .ended))
                        return false
                    }
                    // End may run while Session is still coming up.
                    Task { [session] in await session.begin(id: id) }
                    return true
                }
                memory.preparation = preparation
            }
            if state.phase == .ending, id > memory.lastEnded {
                memory.lastEnded = id
                let preparation = memory.preparation
                Task { [self] in
                    if await preparation?.value == true { await session.end(id: id) }
                    await release(id)
                    await send(.sessionReported(id: id, .ended))
                }
            }
        }
    }

    private func release(_ id: UInt64, memory: inout Memory) {
        guard id > memory.released else { return }
        memory.released = id
        let previous = memory.release
        memory.release = Task { [callAudioReleased] in
            await previous?.value
            await callAudioReleased()
        }
    }

    private func release(_ id: UInt64) async {
        let task = memory.withLock { memory in
            release(id, memory: &memory)
            return memory.release
        }
        await task?.value
    }
}
