/// A part of the app that settles its own work on shutdown and publishes that it has.
public enum TerminationParticipant: CaseIterable, Hashable, Sendable {

    case recording, finalization, summaries, storage
}

/// What keeps an update from relaunching the app now: work the person is in the middle of.
public enum RelaunchBlocker: CaseIterable, Hashable, Sendable {

    case folderPicker, callsWindow, summaries
}

/// Termination policy: a quit is published as an intention, and the app may terminate
/// once every participant has published that it settled and Lifecycle's own work is answered.
/// A relaunch holds the calls-folder claim from its grant until the process exits.
public struct TerminationState: Equatable, Sendable {

    public enum Phase: Equatable, Sendable {

        case running, quitting, terminating, terminated
    }

    /// The relaunch's stage while one of its ports has not answered.
    public enum Relaunch: Equatable, Sendable {

        /// Taking the claim; a blocker or a quit since the request cancels it.
        case taking(cancelled: Bool)
        /// Scheduling the new instance with the claim held.
        case starting
        /// Letting the claim go after a cancelled grant or a failed start.
        case releasing
    }

    public var phase: Phase
    /// Participants that have not yet published that they settled.
    public var unsettled: Set<TerminationParticipant>
    /// What blocks a relaunch, as last reported.
    public var blockers: Set<RelaunchBlocker>
    public var relaunch: Relaunch?
    /// The calls-folder claim the relaunch holds.
    public var token: UInt64?

    /// `unsettled` holds the participants that exist: after a startup failure some do not.
    public init(phase: Phase = .running, unsettled: Set<TerminationParticipant> = Set(TerminationParticipant.allCases),
                blockers: Set<RelaunchBlocker> = [], relaunch: Relaunch? = nil, token: UInt64? = nil) {

        self.phase = phase
        self.unsettled = unsettled
        self.blockers = blockers
        self.relaunch = relaunch
        self.token = token
    }
}

public enum TerminationEvent: Equatable, Sendable {

    case quit, settled(TerminationParticipant), terminated
    /// What blocks a relaunch now; sent first with its initial value and then on each change.
    case blockersChanged(Set<RelaunchBlocker>)
    /// An update replaced the app; it relaunches only while running with nothing blocking.
    case relaunchRequested
    /// The claim's answer: its token, or nil when refused.
    case folderClaimed(token: UInt64?)
    /// Whether the new instance was scheduled; a scheduled relaunch quits this one.
    case relaunched(Bool)
    case folderReleased
}

public enum TerminationEffect: Equatable, Sendable {

    case claimFolder, releaseFolder(token: UInt64), relaunch, terminate
}

public enum TerminationReducer {

    public static func reduce(_ state: TerminationState, _ event: TerminationEvent) -> (TerminationState, TerminationEffect?) {

        var state = state
        switch event {
        case .quit:
            guard state.phase == .running else { return (state, nil) }
            state.phase = .quitting
            if case .taking = state.relaunch { state.relaunch = .taking(cancelled: true) }
        case let .blockersChanged(blockers):
            state.blockers = blockers
            if !blockers.isEmpty, case .taking = state.relaunch { state.relaunch = .taking(cancelled: true) }
            return (state, nil)
        case .relaunchRequested:
            guard state.phase == .running, state.relaunch == nil, state.token == nil, state.blockers.isEmpty else { return (state, nil) }
            state.relaunch = .taking(cancelled: false)
            return (state, .claimFolder)
        case let .folderClaimed(token):
            guard case let .taking(cancelled) = state.relaunch else { return (state, nil) }
            guard let token else { state.relaunch = nil; break }
            state.token = token
            state.relaunch = cancelled ? .releasing : .starting
            return (state, cancelled ? .releaseFolder(token: token) : .relaunch)
        case let .relaunched(scheduled):
            guard state.relaunch == .starting, let token = state.token else { return (state, nil) }
            guard scheduled else { state.relaunch = .releasing; return (state, .releaseFolder(token: token)) }
            state.relaunch = nil
            if state.phase == .running { state.phase = .quitting }
        case .folderReleased:
            guard state.relaunch == .releasing else { return (state, nil) }
            state.relaunch = nil
            state.token = nil
        case let .settled(participant):
            guard state.unsettled.contains(participant) else { return (state, nil) }
            state.unsettled.remove(participant)
        case .terminated:
            guard state.phase == .terminating else { return (state, nil) }
            state.phase = .terminated
            return (state, nil)
        }
        guard state.phase == .quitting, state.unsettled.isEmpty, state.relaunch == nil else { return (state, nil) }
        state.phase = .terminating
        return (state, .terminate)
    }
}

public struct TerminationEffectHandler: Sendable {

    private let claimFolder: @Sendable () async -> UInt64?
    private let releaseFolder: @Sendable (UInt64) async -> Void
    private let relaunch: @Sendable () async -> Bool
    private let terminate: @Sendable () async -> Void

    /// `claimFolder` takes the calls-folder claim for a relaunch and returns its token, or nil when refused;
    /// `relaunch` schedules the new instance to open after this process exits and returns whether it did.
    public init(claimFolder: @escaping @Sendable () async -> UInt64?, releaseFolder: @escaping @Sendable (UInt64) async -> Void,
                relaunch: @escaping @Sendable () async -> Bool, terminate: @escaping @Sendable () async -> Void) {

        self.claimFolder = claimFolder
        self.releaseFolder = releaseFolder
        self.relaunch = relaunch
        self.terminate = terminate
    }

    /// Returns the one event that completes the effect.
    public func handle(_ effect: TerminationEffect) async -> TerminationEvent {

        switch effect {
        case .claimFolder:
            return .folderClaimed(token: await claimFolder())
        case let .releaseFolder(token):
            await releaseFolder(token)
            return .folderReleased
        case .relaunch:
            return .relaunched(await relaunch())
        case .terminate:
            await terminate()
            return .terminated
        }
    }
}
