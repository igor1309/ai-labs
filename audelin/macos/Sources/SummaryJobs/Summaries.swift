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
        /// The submission waiting for its job, until the job is prepared.
        public var submission: SummariesSubmission?
        public var status: String
        public init(stage: Stage, job: Job? = nil, identities: [Identity] = [], warning: Bool = false, notes: String? = nil,
                    terminal: Stage? = nil, requested: Bool = false, cancelling: Bool = false, retryFailed: Bool = false,
                    submission: SummariesSubmission? = nil, status: String = "") {
            self.stage = stage; self.job = job; self.identities = identities; self.warning = warning; self.notes = notes
            self.terminal = terminal; self.requested = requested; self.cancelling = cancelling; self.retryFailed = retryFailed
            self.submission = submission; self.status = status
        }
    }
    public var lifecycle: Lifecycle
    public var dispatch: Bool
    public var calls: [String: Call]
    public init(lifecycle: Lifecycle = .accepting, dispatch: Bool = true, calls: [String: Call] = [:]) {
        self.lifecycle = lifecycle; self.dispatch = dispatch; self.calls = calls
    }
}

/// A finished call's transcript offered for notes.
public struct SummariesSubmission: Equatable, Sendable {
    public var call: String
    public var input: String
    public var entries: [Job.Entry]
    public var finalWrite: Bool
    public var usable: Bool
    /// The user asked for these notes, so they are made even when notes are off.
    public var requested: Bool
    public init(call: String, input: String, entries: [Job.Entry], finalWrite: Bool, usable: Bool, requested: Bool = false) {
        self.call = call; self.input = input; self.entries = entries; self.finalWrite = finalWrite; self.usable = usable; self.requested = requested
    }
}

/// A job as storage holds it.
public struct SummariesSaved: Equatable, Sendable {
    public var stage: SummariesState.Call.Stage
    public var job: Job
    public var identities: [Identity]
    public var warning: Bool
    public var notes: String?
    public var terminal: SummariesState.Call.Stage?
    public init(stage: SummariesState.Call.Stage, job: Job, identities: [Identity] = [], warning: Bool = false,
                notes: String? = nil, terminal: SummariesState.Call.Stage? = nil) {
        self.stage = stage; self.job = job; self.identities = identities; self.warning = warning; self.notes = notes; self.terminal = terminal
    }
}

public enum SummariesEvent: Equatable, Sendable {
    case recover(String)
    /// The call's saved job, or none when storage holds no job for it.
    case recovered(String, SummariesSaved?)
    case loadFailed(String)
    case submit(SummariesSubmission)
    /// The submission's job, or none when notes are off and the user did not ask.
    case prepared(String, Job?)
    case claimed(String, owned: Bool, SummariesSaved)
    case storageFailed(String)
}

public enum SummariesEffect: Equatable, Sendable {
    case load(String)
    case prepare(SummariesSubmission)
    case claim(Job)
}

public struct SummariesReducer: Sendable {
    private let format: @Sendable (SummariesState.Call.Stage, Bool) -> String
    /// Renders a call's status line from its stage and whether its notes lack speaker names.
    public init(format: @escaping @Sendable (SummariesState.Call.Stage, Bool) -> String) { self.format = format }
    public func reduce(_ state: SummariesState, _ event: SummariesEvent) -> (SummariesState, SummariesEffect?) {
        var next = state
        var effect: SummariesEffect?
        let call: String
        switch event {
        case let .recover(id) where state.lifecycle == .accepting && state.calls[id] == nil:
            call = id
            next.calls[id] = .init(stage: .recovering)
            effect = .load(id)
        case let .recovered(id, saved) where state.calls[id]?.stage == .recovering:
            call = id
            if let saved {
                next.calls[id] = .init(stage: saved.stage, job: saved.job, identities: saved.identities, warning: saved.warning,
                                       notes: saved.notes, terminal: saved.terminal)
            } else if let submission = state.calls[id]?.submission {
                next.calls[id] = .init(stage: .preparing, requested: submission.requested, submission: submission)
                effect = .prepare(submission)
            } else {
                next.calls[id] = nil
            }
        case let .loadFailed(id) where state.calls[id]?.stage == .recovering:
            call = id
            next.calls[id] = .init(stage: .failed)
        case let .submit(submission) where state.lifecycle == .accepting && state.calls[submission.call]?.stage == .recovering
                                        && state.calls[submission.call]?.submission == nil:
            // A submission waits for recovery; a saved job takes precedence over it.
            next.calls[submission.call]?.submission = submission
            return (next, nil)
        case let .submit(submission) where state.lifecycle == .accepting && state.calls[submission.call] == nil:
            call = submission.call
            next.calls[call] = .init(stage: .preparing, requested: submission.requested, submission: submission)
            effect = .prepare(submission)
        case let .prepared(id, job) where state.calls[id]?.stage == .preparing:
            call = id
            guard let job, let submission = state.calls[id]?.submission else { next.calls[id] = nil; return (next, nil) }
            let eligible = submission.finalWrite && submission.usable && !job.entries.isEmpty
            next.calls[id]?.job = job
            next.calls[id]?.submission = nil
            next.calls[id]?.stage = eligible ? .claiming : .unavailable
            if eligible { effect = .claim(job) }
        case let .claimed(id, owned, saved) where state.calls[id]?.stage == .claiming:
            call = id
            let stage = owned || saved.stage != .pending ? saved.stage : .observed
            next.calls[id] = .init(stage: stage, job: saved.job, identities: saved.identities, warning: saved.warning,
                                   notes: saved.notes, terminal: saved.terminal, requested: state.calls[id]?.requested ?? false)
        case let .storageFailed(id) where state.calls[id]?.stage == .claiming:
            call = id
            next.calls[id]?.stage = .failed
        default:
            return (state, nil)
        }
        if let work = next.calls[call] { next.calls[call]?.status = format(work.stage, work.warning) }
        return (next, effect)
    }
}
