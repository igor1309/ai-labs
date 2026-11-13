/// One machine for the whole line of a call's notes: every call's stage, from
/// recovery or submission to saved notes, and the lifecycle around them.
public struct SummariesState: Equatable, Sendable {
    public enum Lifecycle: Equatable, Sendable { case accepting, draining, ended }
    public struct Call: Equatable, Sendable {
        public enum Stage: Equatable, Sendable {
            case recovering, preparing, claiming, pending, starting, identifying, checkpointing, noting, publishing, saving
            case retrying, discarding
            case succeeded, failed, interrupted, unavailable, observed
        }
        public var stage: Stage
        public var job: Job?
        public var identities: [Identity]
        public var warning: Bool
        public var notes: String?
        public var terminal: Stage?
        public var requested: Bool
        public var cancelling: Bool
        public var retryFailed: Bool
        public var status: String
        public init(stage: Stage, job: Job? = nil, identities: [Identity] = [], warning: Bool = false, notes: String? = nil,
                    terminal: Stage? = nil, requested: Bool = false, cancelling: Bool = false, retryFailed: Bool = false, status: String = "") {
            self.stage = stage; self.job = job; self.identities = identities; self.warning = warning; self.notes = notes
            self.terminal = terminal; self.requested = requested; self.cancelling = cancelling; self.retryFailed = retryFailed; self.status = status
        }
    }
    public var lifecycle: Lifecycle
    public var dispatch: Bool
    public var calls: [String: Call]
    public init(lifecycle: Lifecycle = .accepting, dispatch: Bool = true, calls: [String: Call] = [:]) {
        self.lifecycle = lifecycle; self.dispatch = dispatch; self.calls = calls
    }
}

public enum SummariesEvent: Equatable, Sendable {}

public enum SummariesEffect: Equatable, Sendable {}

public struct SummariesReducer: Sendable {
    private let format: @Sendable (SummariesState.Call.Stage, Bool) -> String
    /// Renders a call's status line from its stage and whether its notes lack speaker names.
    public init(format: @escaping @Sendable (SummariesState.Call.Stage, Bool) -> String) { self.format = format }
    public func reduce(_ state: SummariesState, _ event: SummariesEvent) -> (SummariesState, SummariesEffect?) {
        switch event {}
    }
}
