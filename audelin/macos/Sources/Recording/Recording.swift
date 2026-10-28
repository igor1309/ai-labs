import Machine
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

public enum RecordingEffect: Equatable, Sendable {

    case beginSession(id: UInt64)
    case endSession(id: UInt64)
}

public enum RecordingReducer {

    public static func reduce(_ state: RecordingState, _ event: RecordingEvent) -> (RecordingState, RecordingEffect?) {

        var state = state
        switch event {
        case .callStarted:
            guard !state.callOn else { return (state, nil) }
            state.callOn = true
            guard state.automatic, !state.heldForCall else { return (state, nil) }
            if state.phase == .ending {
                state.pendingCall = true
                return (state, nil)
            }
            return begin(&state, origin: .call)

        case .callEnded:
            guard state.callOn else { return (state, nil) }
            state.callOn = false
            state.heldForCall = false
            state.pendingCall = false
            guard state.sessionBeganDuringCall else { return (state, nil) }
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
            return (state, nil)

        case let .conditionChanged(condition, available):
            if available { state.missing.remove(condition) }
            else { state.missing.insert(condition) }
            if !available && (condition == .callsFolder || condition == .room) {
                return end(&state)
            }
            return (state, nil)

        case let .sessionReported(id, report):
            guard state.session?.id == id else {
                if state.phase == .idle, id != 0, id == state.lastSessionID,
                   case let .cannotRecord(reason) = report {
                    state.cannotRecord = reason
                }
                return (state, nil)
            }
            switch report {
            case .ready:
                if state.phase == .beginning { state.phase = .recording }
                return (state, nil)
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
                return (state, nil)
            }
        }
    }

    private static func begin(_ state: inout RecordingState, origin: RecordingState.Origin) -> (RecordingState, RecordingEffect?) {

        guard state.phase == .idle, state.missing.isEmpty else { return (state, nil) }
        state.lastSessionID += 1
        state.session = .init(id: state.lastSessionID, origin: origin)
        // A hand start during a call belongs to that call too: Audelin may have missed its start.
        state.sessionBeganDuringCall = state.callOn
        state.phase = .beginning
        state.cannotRecord = nil
        return (state, .beginSession(id: state.lastSessionID))
    }

    private static func end(_ state: inout RecordingState) -> (RecordingState, RecordingEffect?) {

        guard state.phase == .beginning || state.phase == .recording,
              let session = state.session else { return (state, nil) }
        state.phase = .ending
        return (state, .endSession(id: session.id))
    }
}

/// Dispatches each effect to its supplied Session dependency and maps the result.
public struct RecordingEffectHandler: Sendable {

    private let session: any RecordingSession

    public init(session: any RecordingSession) {

        self.session = session
    }

    /// Delivers the one event that completes the effect, then finishes.
    public func handle(_ effect: RecordingEffect) -> AsyncStream<RecordingEvent> {

        AsyncStream { output in
            let task = Task {
                output.yield(await perform(effect))
                output.finish()
            }
            output.onTermination = { _ in task.cancel() }
        }
    }

    private func perform(_ effect: RecordingEffect) async -> RecordingEvent {

        switch effect {
        case let .beginSession(id):
            return .sessionReported(id: id, await session.begin(id: id))
        case let .endSession(id):
            await session.end(id: id)
            return .sessionReported(id: id, .ended)
        }
    }
}

/// Makes the Session follow Recording's state: begins each session it sees once and ends it once
/// its phase is `.ending`, sending each Session report back.
public final class RecordingDoer: Sendable {

    private struct Memory {

        var lastBegun: UInt64 = 0
        var lastEnded: UInt64 = 0
    }

    private let session: any RecordingSession
    private let send: @Sendable (RecordingEvent) async -> Void
    // Session ids only grow, so the last begun and last ended ids are all it must remember.
    private let memory = Mutex(Memory())

    public init(session: any RecordingSession, send: @escaping @Sendable (RecordingEvent) async -> Void) {

        self.session = session
        self.send = send
    }

    /// Observations may merge changes, so a session first seen recording or ending is still begun.
    public func act(on state: RecordingState) {

        guard let id = state.session?.id else { return }
        let ending = state.phase == .ending
        let (begin, end) = memory.withLock { memory in
            let begin = id > memory.lastBegun
            if begin { memory.lastBegun = id }
            let end = ending && id > memory.lastEnded
            if end { memory.lastEnded = id }
            return (begin, end)
        }
        let session = session
        let send = send
        if begin {
            Task { await send(.sessionReported(id: id, await session.begin(id: id))) }
        }
        if end {
            Task {
                await session.end(id: id)
                await send(.sessionReported(id: id, .ended))
            }
        }
    }
}

public final class Recording: Sendable {

    public let machine: Machine<RecordingState, RecordingEvent, RecordingEffect>

    public init(handler: RecordingEffectHandler, initial: RecordingState = .init()) {

        // Bridge until the app composes Recording's model.
        machine = Machine(initial: initial, reduce: RecordingReducer.reduce, handle: { effect in
            for await event in handler.handle(effect) { return event }
            preconditionFailure("A Recording effect delivers one event")
        })
    }

    public nonisolated func send(_ event: RecordingEvent) {

        machine.send(event)
    }

    public func states() async -> AsyncStream<RecordingState> {

        await machine.states()
    }

    public func snapshot() async -> RecordingState {

        await machine.snapshot()
    }

    public func end() async {

        await machine.end()
    }
}
