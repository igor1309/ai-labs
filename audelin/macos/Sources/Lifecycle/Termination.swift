/// A part of the app that settles its own work on shutdown and publishes that it has.
public enum TerminationParticipant: CaseIterable, Hashable, Sendable {

    case recording, finalization, summaries, storage
}

/// What keeps an update from relaunching the app now: work the person is in the middle of.
public enum RelaunchBlocker: CaseIterable, Hashable, Sendable {

    case folderPicker, callsWindow, summaries
}

/// Termination policy: a quit is published as an intention, and the app may terminate
/// once every participant has published that it settled.
public struct TerminationState: Equatable, Sendable {

    public enum Phase: Equatable, Sendable {

        case running, relaunching, quitting, terminating, terminated
    }

    public var phase: Phase
    /// Participants that have not yet published that they settled.
    public var unsettled: Set<TerminationParticipant>

    /// `unsettled` holds the participants that exist: after a startup failure some do not.
    public init(phase: Phase = .running, unsettled: Set<TerminationParticipant> = Set(TerminationParticipant.allCases)) {

        self.phase = phase
        self.unsettled = unsettled
    }
}

public enum TerminationEvent: Equatable, Sendable {

    case quit, settled(TerminationParticipant), terminated
    /// An update replaced the app; it relaunches only when nothing blocks it.
    case relaunchRequested(blockers: Set<RelaunchBlocker>)
    /// Whether the new instance was started; a started relaunch quits this one.
    case relaunched(Bool)
}

public enum TerminationEffect: Equatable, Sendable {

    case relaunch, terminate
}

public enum TerminationReducer {

    public static func reduce(_ state: TerminationState, _ event: TerminationEvent) -> (TerminationState, TerminationEffect?) {

        var state = state
        switch event {
        case .quit:
            guard state.phase == .running || state.phase == .relaunching else { return (state, nil) }
            state.phase = .quitting
        case let .relaunchRequested(blockers):
            guard state.phase == .running, blockers.isEmpty else { return (state, nil) }
            state.phase = .relaunching
            return (state, .relaunch)
        case let .relaunched(started):
            guard state.phase == .relaunching else { return (state, nil) }
            state.phase = started ? .quitting : .running
        case let .settled(participant):
            guard state.unsettled.contains(participant) else { return (state, nil) }
            state.unsettled.remove(participant)
        case .terminated:
            guard state.phase == .terminating else { return (state, nil) }
            state.phase = .terminated
            return (state, nil)
        }
        guard state.phase == .quitting, state.unsettled.isEmpty else { return (state, nil) }
        state.phase = .terminating
        return (state, .terminate)
    }
}

public struct TerminationEffectHandler: Sendable {

    private let relaunch: @Sendable () async -> Bool
    private let terminate: @Sendable () async -> Void

    /// `relaunch` starts the new instance and returns whether it did.
    public init(relaunch: @escaping @Sendable () async -> Bool, terminate: @escaping @Sendable () async -> Void) {

        self.relaunch = relaunch
        self.terminate = terminate
    }

    /// Returns the one event that completes the effect.
    public func handle(_ effect: TerminationEffect) async -> TerminationEvent {

        switch effect {
        case .relaunch:
            return .relaunched(await relaunch())
        case .terminate:
            await terminate()
            return .terminated
        }
    }
}
