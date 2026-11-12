/// Eligibility is based on the latest attempted snapshot, never on an older file
/// or on nonthrowing recording cleanup.
public struct Handoff: Equatable, Sendable {
    public var latestWriteSucceeded: Bool
    public var closed: Bool
    public var offered: Bool
    public var entries: [Job.Entry]
    public var usable: Bool
    /// The closed transcript's remote speakers are being found; the offer waits for them.
    public var diarizing: Bool
    public init(latestWriteSucceeded: Bool = false, closed: Bool = false, offered: Bool = false,
                entries: [Job.Entry] = [], usable: Bool = false, diarizing: Bool = false) {
        self.latestWriteSucceeded = latestWriteSucceeded; self.closed = closed; self.offered = offered
        self.entries = entries; self.usable = usable; self.diarizing = diarizing
    }
    public enum Event: Equatable, Sendable {
        /// `diarized`: the entries with their remote speakers, nil when diarizing failed.
        case wrote([Job.Entry], usable: Bool), writeFailed, closed, diarized([Job.Entry]?)
    }
    public enum Effect: Equatable, Sendable { case diarize, offer([Job.Entry], finalWrite: Bool, usable: Bool) }
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
            guard !state.closed else { return (state, nil) }
            next.closed = true
            // Only a saved transcript has speakers to find; a failed one is offered as it is.
            guard state.latestWriteSucceeded else {
                next.offered = true
                return (next, .offer(next.entries, finalWrite: false, usable: next.usable))
            }
            next.diarizing = true
            return (next, .diarize)
        case let .diarized(entries):
            guard state.diarizing else { return (state, nil) }
            next.diarizing = false; next.offered = true
            if let entries { next.entries = entries }
            return (next, .offer(next.entries, finalWrite: true, usable: next.usable))
        }
        return (next, nil)
    }
}
