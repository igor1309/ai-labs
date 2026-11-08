public enum Installed: Equatable, Sendable {
    case none, available(String)
}

public enum Call: CaseIterable, Equatable, Sendable {
    case idle, inCall, finishingSave
}

public enum Restart: CaseIterable, Equatable, Sendable {
    case none, requested, quitting
}

public enum Item: Equatable, Sendable {
    case absent, active, disabled(String)
}

public struct State: Equatable, Sendable {
    public var running: String
    public var installed: Installed
    public var call: Call
    public var restart: Restart
    public var badge: Bool
    public var item: Item

    public init(running: String, installed: Installed = .none, call: Call = .idle,
                restart: Restart = .none, badge: Bool = false, item: Item = .absent) {
        self.running = running
        self.installed = installed
        self.call = call
        self.restart = restart
        self.badge = badge
        self.item = item
    }
}

public enum Read: Equatable, Sendable {
    case build(String), unreadable
}

public enum Event: Equatable, Sendable {
    case started, bundleChanged, read(Read), callChanged(Call)
    case restartTapped, relaunchStarted, relaunchFailed
}

public enum Effect: Equatable, Sendable {
    case watch, read, relaunch, terminate
}

public func updateAvailable(running: String, installed: String) -> Bool {
    running != installed
}

public struct Reducer: Sendable {
    private let disabledReason: String

    public init(disabledReason: String) {
        self.disabledReason = disabledReason
    }

    public func reduce(_ state: State, _ event: Event) -> (State, Effect?) {
        var next = state
        var effect: Effect?
        switch event {
        case .started: effect = .watch
        case .bundleChanged:
            if state.restart == .none { effect = .read }
        case let .read(.build(id)):
            if state.restart == .none {
                next.installed = updateAvailable(running: state.running, installed: id) ? .available(id) : .none
            }
        case .read(.unreadable): break
        case let .callChanged(call): next.call = call
        case .restartTapped:
            if case .available = state.installed, state.call == .idle, state.restart == .none {
                next.restart = .requested
                effect = .relaunch
            }
        case .relaunchStarted:
            next.restart = .quitting
            effect = .terminate
        case .relaunchFailed: next.restart = .none
        }
        if case .available = next.installed {
            next.badge = true
            next.item = next.call == .idle && next.restart == .none ? .active : .disabled(disabledReason)
        } else {
            next.badge = false
            next.item = .absent
        }
        return (next, effect)
    }
}
