
public struct SummarySubmission: Equatable, Sendable {
    public struct Entry: Equatable, Sendable {
        public var label: String
        public var time: String
        public var text: String
        public init(label: String, time: String, text: String) {
            self.label = label; self.time = time; self.text = text
        }
    }
    public var call: String
    public var input: String
    public var entries: [Entry]
    public var finalWrite: Bool
    public var usable: Bool
    public var requested: Bool
    public init(call: String, input: String, entries: [Entry], finalWrite: Bool, usable: Bool, requested: Bool = false) {
        self.call = call; self.input = input; self.entries = entries; self.finalWrite = finalWrite; self.usable = usable; self.requested = requested
    }
}

public struct SummaryCoordinatorState: Equatable, Sendable {
    public enum Phase: Equatable, Sendable { case accepting, draining, joining, ended }
    public struct Call: Equatable, Sendable {
        public enum Phase: Equatable, Sendable { case recovering, submitting, retrying, pending, dispatching, installed, failing }
        public var phase: Phase
        public var operation: UInt64
        public var submission: SummarySubmission?
        public init(phase: Phase, operation: UInt64 = 0, submission: SummarySubmission? = nil) {
            self.phase = phase; self.operation = operation; self.submission = submission
        }
    }
    public var phase: Phase
    public var dispatch: Bool
    public var sequence: UInt64
    public var retryFailures: Set<String>
    public var calls: [String: Call]
    public init(phase: Phase = .accepting, dispatch: Bool = true, sequence: UInt64 = 0, calls: [String: Call] = [:], retryFailures: Set<String> = []) {
        self.phase = phase; self.dispatch = dispatch; self.sequence = sequence; self.calls = calls; self.retryFailures = retryFailures
    }
}

public enum SummaryRecovery: Equatable, Sendable { case absent, pending, installed }
public enum SummaryCoordinatorEvent: Equatable, Sendable {
    case recover(String), submit(SummarySubmission)
    case recovered(String, SummaryRecovery), recoveryFailed(String)
    case submitted(String, pending: Bool), dispatched(String), failureInstalled(String)
    case retry(String), retried(String), retryFailed(String)
    case forget(String)
    case stopDispatch, shutdown, joined
}

public struct SummaryCoordinatorReducer {
    public init() {}
    public func reduce(_ state: SummaryCoordinatorState, _ event: SummaryCoordinatorEvent) -> SummaryCoordinatorState {
        var next = state
        switch event {
        case let .recover(call) where state.phase == .accepting && state.calls[call] == nil:
            next.calls[call] = .init(phase: .recovering)
        case let .submit(submission) where state.phase == .accepting:
            if state.calls[submission.call] == nil {
                next.calls[submission.call] = .init(phase: .submitting, submission: submission)
            } else if state.calls[submission.call]?.phase == .recovering && state.calls[submission.call]?.submission == nil {
                next.calls[submission.call]?.submission = submission
            }
        case let .recovered(call, outcome) where state.calls[call]?.phase == .recovering:
            switch outcome {
            case .absent:
                if let submission = state.calls[call]?.submission {
                    next.calls[call] = .init(phase: .submitting, submission: submission)
                } else { next.calls[call] = nil }
            case .pending: next.calls[call] = .init(phase: state.dispatch ? .dispatching : .pending)
            case .installed: next.calls[call] = .init(phase: .installed)
            }
        case let .recoveryFailed(call) where state.calls[call]?.phase == .recovering:
            next.calls[call] = .init(phase: .failing)
        case let .submitted(call, pending) where state.calls[call]?.phase == .submitting:
            next.calls[call] = .init(phase: pending ? (state.dispatch ? .dispatching : .pending) : .installed)
        case let .dispatched(call) where state.calls[call]?.phase == .dispatching:
            next.calls[call] = .init(phase: .installed)
        case let .failureInstalled(call) where state.calls[call]?.phase == .failing:
            next.calls[call] = .init(phase: .installed)
        case let .retry(call) where state.phase == .accepting && state.dispatch && state.calls[call]?.phase == .installed:
            next.retryFailures.remove(call)
            next.calls[call] = .init(phase: .retrying)
        case let .retried(call) where state.calls[call]?.phase == .retrying:
            next.calls[call] = .init(phase: state.dispatch ? .dispatching : .pending)
        case let .retryFailed(call) where state.calls[call]?.phase == .retrying:
            next.retryFailures.insert(call)
            next.calls[call] = .init(phase: .installed)
        case let .forget(call) where state.calls[call]?.phase == .installed || state.calls[call]?.phase == .pending:
            next.calls[call] = nil
            next.retryFailures.remove(call)
        case .stopDispatch:
            next.dispatch = false
        case .shutdown where state.phase == .accepting:
            next.dispatch = false; next.phase = .draining
        case .joined where state.phase == .joining: next.phase = .ended
        default: return state
        }
        if !next.dispatch {
            for (call, work) in next.calls where work.phase == .dispatching {
                next.calls[call] = .init(phase: .pending)
            }
        }
        for (call, work) in next.calls where state.calls[call]?.phase != work.phase {
            next.sequence += 1
            next.calls[call]?.operation = next.sequence
        }
        if next.phase == .draining && next.calls.values.allSatisfy({ $0.phase == .pending || $0.phase == .installed }) {
            next.phase = .joining
        }
        return next
    }
}

/// The coordinator speaks only in recovery and job lifecycle outcomes.
public protocol SummaryCoordinatorJobs: Sendable {
    func recover(call: String) async throws -> SummaryRecovery
    func submit(_ submission: SummarySubmission) async -> Bool
    func retry(call: String) async throws
    func dispatch(call: String) async
    func recoveryFailed(call: String) async
    func join() async
}

/// Work is keyed by the phase held until its result arrives; repeated observations do nothing.
/// Runs on its owner's actor; the work itself runs off it.
public final class SummaryCoordinatorDoer {
    private let jobs: any SummaryCoordinatorJobs
    private let send: @Sendable (SummaryCoordinatorEvent) async -> Void
    private var started: Set<UInt64> = []
    private var tasks: [UInt64: Task<Void, Never>] = [:]
    private var joining: Task<Void, Never>?
    public init(jobs: any SummaryCoordinatorJobs, send: @escaping @Sendable (SummaryCoordinatorEvent) async -> Void) {
        self.jobs = jobs; self.send = send
    }
    public func join(isolation: isolated (any Actor)? = #isolation) async {
        for task in tasks.values { await task.value }
        await joining?.value
    }
    public func act(on state: SummaryCoordinatorState) {
        for (call, item) in state.calls {
            guard item.phase != .pending && item.phase != .installed,
                  started.insert(item.operation).inserted else { continue }
            tasks[item.operation] = Task { [jobs, send] in
                let event: SummaryCoordinatorEvent
                switch item.phase {
                case .recovering:
                    do { event = .recovered(call, try await jobs.recover(call: call)) }
                    catch { event = .recoveryFailed(call) }
                case .submitting:
                    guard let submission = item.submission else { preconditionFailure("Submission phase requires input") }
                    event = .submitted(call, pending: await jobs.submit(submission))
                case .retrying:
                    do { try await jobs.retry(call: call); event = .retried(call) }
                    catch { event = .retryFailed(call) }
                case .dispatching:
                    await jobs.dispatch(call: call); event = .dispatched(call)
                case .failing:
                    await jobs.recoveryFailed(call: call); event = .failureInstalled(call)
                case .pending, .installed: preconditionFailure("No asynchronous work for phase")
                }
                await send(event)
            }
        }
        if state.phase == .joining && joining == nil {
            joining = Task { [jobs, send] in await jobs.join(); await send(.joined) }
        }
    }
}
