struct DeviceFollowing: Sendable, Equatable {

    struct Settle: Sendable, Equatable {
        let input: UInt32?
        let deadline: Double
    }

    enum Event: Sendable {
        case defaultChanged(UInt32?, at: Double)
        case settleReached(Settle, at: Double)
        case configurationChanged(currentAvailable: Bool, defaultInput: UInt32?)
        case currentInputDelivering
        case rebuildRefused
    }

    enum Action: Sendable, Equatable {
        case none
        case rebuild(UInt32)
        case fail
    }

    private(set) var input: UInt32
    private(set) var pending: Settle?
    private(set) var failed = false

    init(input: UInt32) {

        self.input = input
    }

    func transition(_ event: Event) -> (state: Self, action: Action) {

        var state = self
        let action = state.apply(event)
        return (state, action)
    }

    private mutating func apply(_ event: Event) -> Action {

        guard !failed else { return .none }
        switch event {
        case let .defaultChanged(candidate, time):
            if candidate == input {
                pending = nil
            } else if pending == nil || pending?.input != candidate {
                pending = Settle(input: candidate, deadline: time + 1.5)
            }
            return .none
        case let .settleReached(settle, time):
            // The deadline distinguishes a returning candidate from its older wait.
            guard pending == settle, time >= settle.deadline else { return .none }
            pending = nil
            guard let candidate = settle.input else { return fail() }
            input = candidate
            return .rebuild(candidate)
        case let .configurationChanged(currentAvailable, defaultInput):
            guard !currentAvailable else { return .rebuild(input) }
            pending = nil
            guard let defaultInput else { return fail() }
            input = defaultInput
            return .rebuild(defaultInput)
        case .currentInputDelivering:
            return .none
        case .rebuildRefused:
            return fail()
        }
    }

    private mutating func fail() -> Action {

        failed = true
        pending = nil
        return .fail
    }
}
