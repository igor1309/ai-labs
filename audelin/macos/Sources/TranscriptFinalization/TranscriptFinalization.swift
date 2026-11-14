/// Recordings' transcripts on their way from the last live write to their final form.
///
/// `Raw` is a call's text as last written, `Far` its far side given to diarized speakers,
/// `Heard` the microphone side heard again from cleaned audio, `Entry` one row as consumers read it.
public struct TranscriptFinalizationState<Raw: Equatable & Sendable, Far: Equatable & Sendable, Heard: Equatable & Sendable>: Equatable, Sendable {

    public var calls: [String: Call]

    public init(calls: [String: Call] = [:]) { self.calls = calls }

    public struct Call: Equatable, Sendable {

        public var stage: Stage
        /// Eligibility follows the latest attempted write, never an older saved one.
        public var latestWriteSucceeded: Bool
        /// The text of the latest successful write.
        public var raw: Raw?
        public var far: Far?
        /// While committing, the side being saved; once final, the side the file holds.
        public var heard: Heard?

        public init(stage: Stage = .writing, latestWriteSucceeded: Bool = false, raw: Raw? = nil, far: Far? = nil, heard: Heard? = nil) {
            self.stage = stage; self.latestWriteSucceeded = latestWriteSucceeded
            self.raw = raw; self.far = far; self.heard = heard
        }
    }

    public enum Stage: Equatable, Sendable {

        case writing
        /// Closed after a saved write: the far side's speakers are being found.
        case diarizing
        /// The microphone side is being heard again from cleaned audio.
        case cleaning
        /// The cleaned microphone side is replacing the saved one.
        case committing
        /// Closed after a saved write; the transcript is final.
        case finalized
        /// Closed after a failed write; the transcript is final as last saved.
        case failed
    }
}

/// The one final form of a call's transcript.
public struct FinalTranscript<Entry: Equatable & Sendable>: Equatable, Sendable {

    public let entries: [Entry]
    /// Whether the entries hold recognized words.
    public let usable: Bool
    /// Whether the transcript file holds the latest text.
    public let finalWrite: Bool

    public init(entries: [Entry], usable: Bool, finalWrite: Bool) {
        self.entries = entries; self.usable = usable; self.finalWrite = finalWrite
    }
}

public enum TranscriptFinalizationEvent<Raw: Equatable & Sendable, Far: Equatable & Sendable, Heard: Equatable & Sendable>: Equatable, Sendable {

    case wrote(call: String, Raw)
    case writeFailed(call: String)
    case closed(call: String)
    /// Nil when diarizing failed: the far side stays as written.
    case diarized(call: String, Far?)
    /// Nil when cleanup kept the microphone side as written.
    case cleaned(call: String, Heard?)
    case committed(call: String, succeeded: Bool)
}

public enum TranscriptFinalizationEffect<Raw: Equatable & Sendable, Far: Equatable & Sendable, Heard: Equatable & Sendable, Entry: Equatable & Sendable>: Equatable, Sendable {

    case diarize(call: String, Raw)
    case clean(call: String, Raw, Far?)
    case commit(call: String, Raw, Far?, Heard)
    case publish(call: String, FinalTranscript<Entry>)
}

public struct TranscriptFinalizationReducer<Raw: Equatable & Sendable, Far: Equatable & Sendable, Heard: Equatable & Sendable, Entry: Equatable & Sendable>: Sendable {

    public typealias State = TranscriptFinalizationState<Raw, Far, Heard>
    public typealias Event = TranscriptFinalizationEvent<Raw, Far, Heard>
    public typealias Effect = TranscriptFinalizationEffect<Raw, Far, Heard, Entry>

    private let entries: @Sendable (Raw, Far?, Heard?) -> [Entry]

    /// `entries` gives a call's rows from its text, far side and heard microphone side.
    public init(entries: @escaping @Sendable (Raw, Far?, Heard?) -> [Entry]) { self.entries = entries }

    public func reduce(_ state: State, _ event: Event) -> (State, Effect?) {

        var next = state
        switch event {
        case let .wrote(id, raw):
            var call = state.calls[id] ?? .init()
            guard call.stage == .writing else { return (state, nil) }
            call.raw = raw; call.latestWriteSucceeded = true
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
            guard call.latestWriteSucceeded, let raw = call.raw else {
                call.stage = .failed
                next.calls[id] = call
                return (next, .publish(call: id, final(call, finalWrite: false)))
            }
            call.stage = .diarizing
            next.calls[id] = call
            return (next, .diarize(call: id, raw))

        case let .diarized(id, far):
            guard var call = state.calls[id], call.stage == .diarizing, let raw = call.raw else { return (state, nil) }
            call.far = far; call.stage = .cleaning
            next.calls[id] = call
            return (next, .clean(call: id, raw, far))

        case let .cleaned(id, heard):
            guard var call = state.calls[id], call.stage == .cleaning, let raw = call.raw else { return (state, nil) }
            guard let heard else {
                call.stage = .finalized
                next.calls[id] = call
                return (next, .publish(call: id, final(call, finalWrite: true)))
            }
            call.heard = heard; call.stage = .committing
            next.calls[id] = call
            return (next, .commit(call: id, raw, call.far, heard))

        case let .committed(id, succeeded):
            guard var call = state.calls[id], call.stage == .committing else { return (state, nil) }
            // What the file holds is what consumers read: an uncommitted cleanup is dropped.
            if !succeeded { call.heard = nil }
            call.stage = .finalized
            next.calls[id] = call
            return (next, .publish(call: id, final(call, finalWrite: true)))
        }
    }

    private func final(_ call: State.Call, finalWrite: Bool) -> FinalTranscript<Entry> {
        let rows = call.raw.map { entries($0, call.far, call.heard) } ?? []
        return .init(entries: rows, usable: !rows.isEmpty, finalWrite: finalWrite)
    }
}
