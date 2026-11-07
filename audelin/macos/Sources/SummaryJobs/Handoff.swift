/// Eligibility is based on the latest attempted snapshot, never on an older file
/// or on nonthrowing recording cleanup.
public struct Handoff: Equatable, Sendable {
    public var latestWriteSucceeded: Bool
    public var closed: Bool
    public var offered: Bool
    public var entries: [Job.Entry]
    public var usable: Bool
    public init(latestWriteSucceeded: Bool = false, closed: Bool = false, offered: Bool = false,
                entries: [Job.Entry] = [], usable: Bool = false) {
        self.latestWriteSucceeded = latestWriteSucceeded; self.closed = closed; self.offered = offered
        self.entries = entries; self.usable = usable
    }
    public enum Event: Equatable, Sendable {
        case wrote([Job.Entry], usable: Bool), writeFailed, closed
    }
    public enum Effect: Equatable, Sendable { case offer([Job.Entry], finalWrite: Bool, usable: Bool) }
    public static func reduce(_ state: Self, _ event: Event) -> (Self, Effect?) {
        guard !state.offered else { return (state, nil) }
        var next = state
        switch event {
        case let .wrote(entries, usable):
            guard !state.closed else { return (state, nil) }
            next.entries = entries; next.usable = usable; next.latestWriteSucceeded = true
        case .writeFailed:
            guard !state.closed else { return (state, nil) }
            next.latestWriteSucceeded = false
        case .closed:
            next.closed = true; next.offered = true
            return (next, .offer(next.entries, finalWrite: next.latestWriteSucceeded, usable: next.usable))
        }
        return (next, nil)
    }
}
