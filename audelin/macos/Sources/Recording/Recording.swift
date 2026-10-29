import Synchronization

public enum RecordingCondition: CaseIterable, Hashable, Sendable {

    case microphoneAccess
    case callAudioAccess
    case callsFolder
    case room
}

public enum RecordingSessionReport: Equatable, Sendable {

    case ready
    case cannotRecord(String)
    case ended
}

/// Compose begins and ends Sessions and translates their later reports into events.
public protocol RecordingSession: Sendable {

    func begin(id: UInt64) async -> RecordingSessionReport

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

    /// Conditions start unknown, so a start waits for each to be reported available.
    public init(automatic: Bool = false, missing: Set<RecordingCondition> = Set(RecordingCondition.allCases)) {

        self.automatic = automatic
        self.missing = missing
    }
}

public enum RecordingEvent: Equatable, Sendable {

    case callStarted
    case callEnded
    case userStart
    case userStop
    case automaticChanged(Bool)
    case conditionChanged(RecordingCondition, available: Bool)
    case sessionReported(id: UInt64, RecordingSessionReport)
}

public enum RecordingReducer {

    public static func reduce(_ state: RecordingState, _ event: RecordingEvent) -> RecordingState {

        var state = state
        switch event {
        case .callStarted:
            guard !state.callOn else { return state }
            state.callOn = true
            guard state.automatic, !state.heldForCall else { return state }
            if state.phase == .ending {
                state.pendingCall = true
                return state
            }
            return begin(&state, origin: .call)

        case .callEnded:
            guard state.callOn else { return state }
            state.callOn = false
            state.heldForCall = false
            state.pendingCall = false
            guard state.sessionBeganDuringCall else { return state }
            return end(&state)

        case .userStart:
            return begin(&state, origin: .hand)

        case .userStop:
            if state.callOn { state.heldForCall = true }
            state.pendingCall = false
            return end(&state)

        case let .automaticChanged(enabled):
            state.automatic = enabled
            if !enabled { state.pendingCall = false }
            return state

        case let .conditionChanged(condition, available):
            if available { state.missing.remove(condition) }
            else { state.missing.insert(condition) }
            if !available && (condition == .callsFolder || condition == .room) {
                return end(&state)
            }
            return state

        case let .sessionReported(id, report):
            guard state.session?.id == id else {
                if state.phase == .idle, id != 0, id == state.lastSessionID,
                   case let .cannotRecord(reason) = report {
                    state.cannotRecord = reason
                }
                return state
            }
            switch report {
            case .ready:
                if state.phase == .beginning { state.phase = .recording }
                return state
            case let .cannotRecord(reason):
                state.cannotRecord = reason
                return end(&state)
            case .ended:
                state.phase = .idle
                state.session = nil
                state.sessionBeganDuringCall = false
                let resumeCall = state.pendingCall && state.callOn && state.automatic && !state.heldForCall
                state.pendingCall = false
                if resumeCall { return begin(&state, origin: .call) }
                return state
            }
        }
    }

    private static func begin(_ state: inout RecordingState, origin: RecordingState.Origin) -> RecordingState {

        // Call-audio evidence is refreshed by the doer, including when the last reading failed.
        guard state.phase == .idle, state.missing.subtracting([.callAudioAccess]).isEmpty else { return state }
        state.lastSessionID += 1
        state.session = .init(id: state.lastSessionID, origin: origin)
        // A hand start during a call belongs to that call too: Audelin may have missed its start.
        state.sessionBeganDuringCall = state.callOn
        state.phase = .beginning
        state.cannotRecord = nil
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
                    Task { [self] in
                        let report = await session.begin(id: id)
                        if report == .ended { await release(id) }
                        await send(.sessionReported(id: id, report))
                    }
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
