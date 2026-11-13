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
    /// Shutdown's release of the interrupted jobs has not answered yet.
    public var releasing: Bool
    public init(lifecycle: Lifecycle = .accepting, dispatch: Bool = true, calls: [String: Call] = [:], releasing: Bool = false) {
        self.lifecycle = lifecycle; self.dispatch = dispatch; self.calls = calls; self.releasing = releasing
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
    /// Storage's answer to a start: owned when this machine runs the job, else another process does.
    case started(String, owned: Bool)
    case identified(String, [Identity])
    case identificationFailed(String)
    case checkpointed(String)
    case noted(String, String)
    case notesFailed(String)
    case published(String)
    case saved(String)
    case storageFailed(String)
    /// Runs a failed or interrupted call's job again.
    case retry(String)
    /// The job saved anew for its next run.
    case retried(String, SummariesSaved)
    case retryFailed(String)
    /// Drops a settled call from the machine.
    case forget(String)
    /// The user's wish to stop a call's notes; a running stage is discarded when its result arrives.
    case cancel(String)
    case discarded(String)
    /// Stops the machine: running jobs are interrupted and released, and it ends once nothing is in flight.
    case shutdown
    case released
    /// Reloads the calls another process runs.
    case refresh
    /// Each reloaded call's saved job, or none when storage no longer holds one; a call that failed to load is absent.
    case reloaded([String: SummariesSaved?])
    /// Stops starting jobs; a start not yet answered goes back to pending.
    case stopDispatch
}

public enum SummariesEffect: Equatable, Sendable {
    case load(String)
    case prepare(SummariesSubmission)
    case claim(Job)
    case start(Job)
    case identify(Job)
    case checkpoint(Job, [Identity], warning: Bool)
    case notes(Job, [Identity])
    case publish(Job, String, warning: Bool)
    case save(Job, SummariesState.Call.Stage, warning: Bool)
    case retry(Job)
    case discard(Job)
    case release([Job])
    case reload([String])
}

public struct SummariesReducer: Sendable {
    private let format: @Sendable (SummariesState.Call.Stage, Bool) -> String
    /// Renders a call's status line from its stage and whether its notes lack speaker names.
    public init(format: @escaping @Sendable (SummariesState.Call.Stage, Bool) -> String) { self.format = format }
    /// The stages that wait on storage or generation, which a storage failure ends.
    /// The stages a call rests in once nothing runs for it.
    static let settled: Set<SummariesState.Call.Stage> = [.succeeded, .failed, .interrupted, .unavailable]
    /// The stages whose result a cancel waits for before it discards the job.
    static let running: Set<SummariesState.Call.Stage> = [.starting, .identifying, .checkpointing, .noting, .publishing, .saving]
    /// The call and stage a result answers, for the results a cancel turns into a discard.
    static func answered(_ event: SummariesEvent) -> (String, SummariesState.Call.Stage)? {
        switch event {
        case let .started(id, owned: true): (id, .starting)
        case let .identified(id, _), let .identificationFailed(id): (id, .identifying)
        case let .checkpointed(id): (id, .checkpointing)
        case let .noted(id, _), let .notesFailed(id): (id, .noting)
        case let .published(id): (id, .publishing)
        case let .saved(id): (id, .saving)
        default: nil
        }
    }
    /// The stages that wait on a storage answer shutdown lets arrive before the machine ends.
    static let inFlight: Set<SummariesState.Call.Stage> = [.recovering, .preparing, .claiming, .retrying]
    static let working: Set<SummariesState.Call.Stage> = [.claiming, .starting, .identifying, .checkpointing, .noting, .publishing, .saving, .discarding]
    public func reduce(_ state: SummariesState, _ event: SummariesEvent) -> (SummariesState, SummariesEffect?) {
        var (next, effect) = step(state, event)
        if next == state && effect == nil { return (state, nil) }
        if next.lifecycle == .draining && !next.releasing && !next.calls.values.contains(where: { SummariesReducer.inFlight.contains($0.stage) }) {
            next.lifecycle = .ended
        }
        return (next, effect)
    }
    private func step(_ state: SummariesState, _ event: SummariesEvent) -> (SummariesState, SummariesEffect?) {
        var next = state
        var effect: SummariesEffect?
        let call: String
        if let (id, stage) = SummariesReducer.answered(event), let work = state.calls[id], work.cancelling,
           work.stage == stage, let job = work.job {
            next.calls[id]?.stage = .discarding
            next.calls[id]?.status = format(.discarding, work.warning)
            return (next, .discard(job))
        }
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
                if saved.stage == .pending && state.dispatch { next.calls[id]?.stage = .starting; effect = .start(saved.job) }
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
            if stage == .pending && state.dispatch { next.calls[id]?.stage = .starting; effect = .start(saved.job) }
        case let .started(id, owned) where state.calls[id]?.stage == .starting:
            call = id
            guard owned else { next.calls[id]?.stage = .observed; break }
            guard let job = state.calls[id]?.job else { return (state, nil) }
            if job.speakers { next.calls[id]?.stage = .identifying; effect = .identify(job) }
            else { next.calls[id]?.stage = .noting; effect = .notes(job, []) }
        case let .identified(id, identities) where state.calls[id]?.stage == .identifying:
            guard let job = state.calls[id]?.job else { return (state, nil) }
            call = id
            next.calls[id]?.identities = identities; next.calls[id]?.stage = .checkpointing
            effect = .checkpoint(job, identities, warning: false)
        case let .identificationFailed(id) where state.calls[id]?.stage == .identifying:
            guard let job = state.calls[id]?.job else { return (state, nil) }
            call = id
            next.calls[id]?.warning = true; next.calls[id]?.stage = .checkpointing
            effect = .checkpoint(job, [], warning: true)
        case let .checkpointed(id) where state.calls[id]?.stage == .checkpointing:
            guard let work = state.calls[id], let job = work.job else { return (state, nil) }
            call = id
            next.calls[id]?.stage = .noting
            effect = .notes(job, work.identities)
        case let .noted(id, notes) where state.calls[id]?.stage == .noting:
            guard let work = state.calls[id], let job = work.job else { return (state, nil) }
            call = id
            next.calls[id]?.notes = notes; next.calls[id]?.stage = .publishing
            effect = .publish(job, notes, warning: work.warning)
        case let .notesFailed(id) where state.calls[id]?.stage == .noting:
            guard let work = state.calls[id], let job = work.job else { return (state, nil) }
            call = id
            next.calls[id]?.stage = .saving; next.calls[id]?.terminal = .failed
            effect = .save(job, .failed, warning: work.warning)
        case let .published(id) where state.calls[id]?.stage == .publishing:
            guard let work = state.calls[id], let job = work.job else { return (state, nil) }
            call = id
            next.calls[id]?.stage = .saving; next.calls[id]?.terminal = .succeeded
            effect = .save(job, .succeeded, warning: work.warning)
        case let .saved(id) where state.calls[id]?.stage == .saving:
            call = id
            next.calls[id]?.stage = state.calls[id]?.terminal ?? .failed
        case let .storageFailed(id) where state.calls[id].map({ SummariesReducer.working.contains($0.stage) }) ?? false:
            call = id
            next.calls[id]?.stage = .failed
        case .stopDispatch where state.dispatch:
            next.dispatch = false
            for (id, work) in state.calls where work.stage == .starting {
                next.calls[id]?.stage = .pending
                next.calls[id]?.status = format(.pending, work.warning)
            }
            return (next, nil)
        case let .retry(id) where state.lifecycle == .accepting && state.dispatch
                                && (state.calls[id]?.stage == .failed || state.calls[id]?.stage == .interrupted):
            guard let work = state.calls[id], let job = work.job else { return (state, nil) }
            call = id
            next.calls[id]?.stage = .retrying; next.calls[id]?.terminal = work.stage; next.calls[id]?.retryFailed = false
            effect = .retry(job)
        case let .retried(id, saved) where state.calls[id]?.stage == .retrying:
            call = id
            next.calls[id] = .init(stage: saved.stage, job: saved.job, identities: saved.identities, warning: saved.warning,
                                   notes: saved.notes, terminal: saved.terminal, requested: state.calls[id]?.requested ?? false)
            if saved.stage == .pending && state.dispatch { next.calls[id]?.stage = .starting; effect = .start(saved.job) }
        case let .retryFailed(id) where state.calls[id]?.stage == .retrying:
            call = id
            next.calls[id]?.stage = state.calls[id]?.terminal ?? .failed; next.calls[id]?.retryFailed = true
        case let .forget(id) where state.calls[id].map({ SummariesReducer.settled.contains($0.stage) }) ?? false:
            next.calls[id] = nil
            return (next, nil)
        case let .cancel(id) where state.calls[id].map({ SummariesReducer.running.contains($0.stage) && !$0.cancelling }) ?? false:
            call = id
            next.calls[id]?.cancelling = true
        case let .cancel(id) where state.calls[id]?.stage == .observed || state.calls[id]?.stage == .unavailable:
            call = id
            next.calls[id]?.stage = .interrupted
        case let .discarded(id) where state.calls[id]?.stage == .discarding:
            next.calls[id] = nil
            return (next, nil)
        case .shutdown where state.lifecycle == .accepting:
            next.lifecycle = .draining; next.dispatch = false
            var jobs: [Job] = []
            for (id, work) in state.calls.sorted(by: { $0.key < $1.key })
            where SummariesReducer.running.contains(work.stage) || work.stage == .discarding {
                next.calls[id]?.stage = .interrupted
                next.calls[id]?.status = format(.interrupted, work.warning)
                if let job = work.job { jobs.append(job) }
            }
            next.releasing = !jobs.isEmpty
            return (next, jobs.isEmpty ? nil : .release(jobs))
        case .released where state.releasing:
            next.releasing = false
            return (next, nil)
        case .refresh where state.lifecycle != .ended:
            let observed = state.calls.filter { $0.value.stage == .observed }.keys.sorted()
            return (state, observed.isEmpty ? nil : .reload(observed))
        case let .reloaded(results):
            for (id, saved) in results where state.calls[id]?.stage == .observed {
                guard let saved else { next.calls[id] = nil; continue }
                let stage = saved.stage == .pending ? .observed : saved.stage
                next.calls[id] = .init(stage: stage, job: saved.job, identities: saved.identities, warning: saved.warning,
                                       notes: saved.notes, terminal: saved.terminal, requested: state.calls[id]?.requested ?? false,
                                       status: format(stage, saved.warning))
            }
            return (next, nil)
        default:
            return (state, nil)
        }
        if let work = next.calls[call] { next.calls[call]?.status = format(work.stage, work.warning) }
        return (next, effect)
    }
}
