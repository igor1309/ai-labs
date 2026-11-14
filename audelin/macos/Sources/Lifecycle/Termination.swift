/// A part of the app that settles its own work on shutdown and publishes that it has.
public enum TerminationParticipant: CaseIterable, Hashable, Sendable {

    case recording, finalization, summaries, storage
}

/// Termination policy: a quit is published as an intention, and the app may terminate
/// once every participant has published that it settled.
public struct TerminationState: Equatable, Sendable {

    public enum Phase: Equatable, Sendable {

        case running, quitting, terminating, terminated
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
}

public enum TerminationEffect: Equatable, Sendable {

    case terminate
}

public enum TerminationReducer {

    public static func reduce(_ state: TerminationState, _ event: TerminationEvent) -> (TerminationState, TerminationEffect?) {

        var state = state
        switch event {
        case .quit:
            guard state.phase == .running else { return (state, nil) }
            state.phase = .quitting
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

    private let terminate: @Sendable () async -> Void

    public init(terminate: @escaping @Sendable () async -> Void) {

        self.terminate = terminate
    }

    /// Returns the one event that completes the effect.
    public func handle(_ effect: TerminationEffect) async -> TerminationEvent {

        switch effect {
        case .terminate:
            await terminate()
            return .terminated
        }
    }
}
