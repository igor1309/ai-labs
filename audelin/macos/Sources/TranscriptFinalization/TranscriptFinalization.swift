/// A recording's transcript on its way from the last live write to its final form.
/// `Entry` is one transcript row as the app's consumers read it.
public struct TranscriptFinalizationState<Entry: Equatable & Sendable>: Equatable, Sendable {

    public var calls: [String: Call]

    public init(calls: [String: Call] = [:]) { self.calls = calls }

    public struct Call: Equatable, Sendable {

        public var stage: Stage
        /// Eligibility follows the latest attempted write, never an older saved one.
        public var latestWriteSucceeded: Bool
        /// The entries of the latest successful write.
        public var entries: [Entry]
        /// Whether those entries hold recognized words.
        public var usable: Bool

        public init(stage: Stage = .writing, latestWriteSucceeded: Bool = false, entries: [Entry] = [], usable: Bool = false) {
            self.stage = stage; self.latestWriteSucceeded = latestWriteSucceeded; self.entries = entries; self.usable = usable
        }
    }

    public enum Stage: Equatable, Sendable {

        case writing
        /// Closed after a saved write: the far side's speakers are being found.
        case diarizing
        /// Closed after a saved write; the transcript is final.
        case finalized
        /// Closed after a failed write; the transcript is final as last saved.
        case failed
    }
}

/// The one final form of a call's transcript.
public struct FinalTranscript<Entry: Equatable & Sendable>: Equatable, Sendable {

    public let entries: [Entry]
    public let usable: Bool
    /// Whether the transcript file holds the latest text.
    public let finalWrite: Bool

    public init(entries: [Entry], usable: Bool, finalWrite: Bool) {
        self.entries = entries; self.usable = usable; self.finalWrite = finalWrite
    }
}

public enum TranscriptFinalizationEvent<Entry: Equatable & Sendable>: Equatable, Sendable {

    case wrote(call: String, entries: [Entry], usable: Bool)
    case writeFailed(call: String)
    case closed(call: String)
    /// The entries with their remote speakers; nil when diarizing failed.
    case diarized(call: String, entries: [Entry]?)
}

public enum TranscriptFinalizationEffect<Entry: Equatable & Sendable>: Equatable, Sendable {

    case diarize(call: String)
    case publish(call: String, FinalTranscript<Entry>)
}

public enum TranscriptFinalizationReducer<Entry: Equatable & Sendable> {

    public typealias State = TranscriptFinalizationState<Entry>
    public typealias Event = TranscriptFinalizationEvent<Entry>
    public typealias Effect = TranscriptFinalizationEffect<Entry>

    public static func reduce(_ state: State, _ event: Event) -> (State, Effect?) {

        var next = state
        switch event {
        case let .wrote(id, entries, usable):
            var call = state.calls[id] ?? .init()
            guard call.stage == .writing else { return (state, nil) }
            call.entries = entries; call.usable = usable; call.latestWriteSucceeded = true
            next.calls[id] = call
            return (next, nil)

        case let .writeFailed(id):
            var call = state.calls[id] ?? .init()
            guard call.stage == .writing else { return (state, nil) }
            call.latestWriteSucceeded = false
            next.calls[id] = call
            return (next, nil)

        case let .closed(id):
            var call = state.calls[id] ?? .init()
            guard call.stage == .writing else { return (state, nil) }
            // Only a saved transcript has speakers to find; a failed one is final as it is.
            guard call.latestWriteSucceeded else {
                call.stage = .failed
                next.calls[id] = call
                return (next, .publish(call: id, .init(entries: call.entries, usable: call.usable, finalWrite: false)))
            }
            call.stage = .diarizing
            next.calls[id] = call
            return (next, .diarize(call: id))

        case let .diarized(id, entries):
            guard var call = state.calls[id], call.stage == .diarizing else { return (state, nil) }
            if let entries { call.entries = entries }
            call.stage = .finalized
            next.calls[id] = call
            return (next, .publish(call: id, .init(entries: call.entries, usable: call.usable, finalWrite: true)))
        }
    }
}
