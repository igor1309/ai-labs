/// How each finishing stage of a call ended, carried with the text each replacing write saves.
/// A stage not yet ended is nil, so a file tells only what it holds.
public struct FinishingOutcomes: Equatable, Sendable {
    /// `done` names the diarizer whose split was saved; `nothingKept` covers a failed pass and one that saved no split.
    public enum Split: Equatable, Sendable { case done(diarizer: String), nothingKept, skipped }
    /// `nothingKept` is a microphone side kept as written; `skipped` one shutdown stopped.
    public enum Cleaning: Equatable, Sendable { case done, nothingKept, skipped }
    public var split: Split?
    public var cleaning: Cleaning?
    public init(split: Split? = nil, cleaning: Cleaning? = nil) {
        self.split = split; self.cleaning = cleaning
    }
}

/// The far side the diarizer port saved. A nil diarizer is a save of names alone, which keeps no split.
public struct SavedDiarization<Far: Equatable & Sendable>: Equatable, Sendable {
    public let far: Far
    public let diarizer: String?
    public init(far: Far, diarizer: String?) { self.far = far; self.diarizer = diarizer }
}

/// One call's replacement, including a decision to keep its microphone side as written.
public struct TranscriptCommit<Raw: Equatable & Sendable, Names: Equatable & Sendable, Far: Equatable & Sendable, Heard: Equatable & Sendable>: Equatable, Sendable {
    public let raw: Raw
    public let names: Names?
    public let far: Far?
    public let heard: Heard?
    public let outcomes: FinishingOutcomes
    public init(raw: Raw, names: Names?, far: Far?, heard: Heard?, outcomes: FinishingOutcomes) {
        self.raw = raw; self.names = names; self.far = far; self.heard = heard; self.outcomes = outcomes
    }
}

/// Recordings' transcripts on their way from the last live write to their final form.
///
/// `Raw` is a call's text as last written, `Names` its speaker names taken when it closed,
/// `Far` its far side given to diarized speakers, `Heard` the microphone side heard again from cleaned audio, `Entry` one row as consumers read it.
public struct TranscriptFinalizationState<Raw: Equatable & Sendable, Names: Equatable & Sendable, Far: Equatable & Sendable, Heard: Equatable & Sendable>: Equatable, Sendable {

    public var calls: [String: Call]
    /// After shutdown no new model work starts: each call becomes final as soon as its file is.
    public var shuttingDown: Bool
    /// No more transcript openings, writes or closes will arrive.
    public var inputEnded: Bool
    /// Shut down with input ended and every call's final form published.
    public var settled: Bool

    public init(calls: [String: Call] = [:], shuttingDown: Bool = false, inputEnded: Bool = false, settled: Bool = false) {
        self.calls = calls; self.shuttingDown = shuttingDown; self.inputEnded = inputEnded; self.settled = settled
    }

    public struct Call: Equatable, Sendable {

        public var stage: Stage
        /// Eligibility follows the latest attempted write, never an older saved one.
        public var latestWriteSucceeded: Bool
        /// The text of the latest successful write.
        public var raw: Raw?
        /// The names taken when the transcript closed; a commit renders with them.
        public var names: Names?
        public var far: Far?
        /// While committing, the side being saved; once final, the side the file holds.
        public var heard: Heard?
        /// Each finishing stage's outcome so far; every replacing write carries it.
        public var outcomes: FinishingOutcomes
        /// The final form has reached its consumers.
        public var published: Bool

        public init(stage: Stage = .writing, latestWriteSucceeded: Bool = false, raw: Raw? = nil, names: Names? = nil, far: Far? = nil,
                    heard: Heard? = nil, outcomes: FinishingOutcomes = .init(), published: Bool = false) {
            self.stage = stage; self.latestWriteSucceeded = latestWriteSucceeded
            self.raw = raw; self.names = names; self.far = far; self.heard = heard; self.outcomes = outcomes; self.published = published
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

public enum TranscriptFinalizationEvent<Raw: Equatable & Sendable, Names: Equatable & Sendable, Far: Equatable & Sendable, Heard: Equatable & Sendable>: Equatable, Sendable {

    /// The call's transcript is open; it is final only once it closes and is published.
    case opened(call: String)
    case wrote(call: String, Raw)
    case writeFailed(call: String)
    /// Carries the call's names as they were when its transcript closed.
    case closed(call: String, names: Names)
    /// Nil when diarizing failed: the far side stays as written.
    case diarized(call: String, SavedDiarization<Far>?)
    /// Nil when cleanup kept the microphone side as written.
    case cleaned(call: String, Heard?)
    case committed(call: String, succeeded: Bool)
    /// The calls' final forms have reached their consumers.
    case published(calls: Set<String>)
    /// No more transcript openings, writes or closes will arrive.
    case inputEnded
    case shutdown
}

public enum TranscriptFinalizationEffect<Raw: Equatable & Sendable, Names: Equatable & Sendable, Far: Equatable & Sendable, Heard: Equatable & Sendable, Entry: Equatable & Sendable>: Equatable, Sendable {

    case diarize(call: String, Raw, FinishingOutcomes)
    case clean(call: String, Raw, Far?)
    case commit(call: String, Raw, Names?, Far?, Heard?, FinishingOutcomes)
    /// Each call's final form, published once.
    case publish([String: FinalTranscript<Entry>])
    /// Stops cleanup before committing each call as written.
    case stopCleaning([String: TranscriptCommit<Raw, Names, Far, Heard>])
}

public struct TranscriptFinalizationReducer<Raw: Equatable & Sendable, Names: Equatable & Sendable, Far: Equatable & Sendable, Heard: Equatable & Sendable, Entry: Equatable & Sendable>: Sendable {

    public typealias State = TranscriptFinalizationState<Raw, Names, Far, Heard>
    public typealias Event = TranscriptFinalizationEvent<Raw, Names, Far, Heard>
    public typealias Effect = TranscriptFinalizationEffect<Raw, Names, Far, Heard, Entry>

    private let entries: @Sendable (Raw, Far?, Heard?) -> [Entry]

    /// `entries` gives a call's rows from its text, far side and heard microphone side.
    public init(entries: @escaping @Sendable (Raw, Far?, Heard?) -> [Entry]) { self.entries = entries }

    public func reduce(_ state: State, _ event: Event) -> (State, Effect?) {

        let (stepped, effect) = step(state, event)
        var next = stepped
        next.settled = next.shuttingDown && next.inputEnded && next.calls.values.allSatisfy(\.published)
        return (next, effect)
    }

    private func step(_ state: State, _ event: Event) -> (State, Effect?) {

        var next = state
        switch event {
        case let .opened(id):
            guard state.calls[id] == nil else { return (state, nil) }
            next.calls[id] = .init()
            return (next, nil)

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

        case let .closed(id, names):
            var call = state.calls[id] ?? .init()
            guard call.stage == .writing else { return (state, nil) }
            call.names = names
            // Only a saved transcript has speakers to find; a failed one is final as it is.
            guard call.latestWriteSucceeded, let raw = call.raw else {
                call.stage = .failed
                next.calls[id] = call
                return (next, publish(id, call, finalWrite: false))
            }
            guard !state.shuttingDown else {
                call.stage = .committing
                call.outcomes = .init(split: .skipped, cleaning: .skipped)
                next.calls[id] = call
                return (next, commit(id, call, raw: raw))
            }
            call.stage = .diarizing
            next.calls[id] = call
            return (next, .diarize(call: id, raw, call.outcomes))

        case let .diarized(id, saved):
            guard var call = state.calls[id], call.stage == .diarizing, let raw = call.raw else { return (state, nil) }
            call.far = saved?.far
            call.outcomes.split = saved?.diarizer.map { .done(diarizer: $0) } ?? .nothingKept
            guard !state.shuttingDown else {
                call.stage = .committing
                call.outcomes.cleaning = .skipped
                next.calls[id] = call
                return (next, commit(id, call, raw: raw))
            }
            call.stage = .cleaning
            next.calls[id] = call
            return (next, .clean(call: id, raw, call.far))

        case let .cleaned(id, heard):
            guard var call = state.calls[id], call.stage == .cleaning, let raw = call.raw else { return (state, nil) }
            call.heard = heard; call.stage = .committing
            call.outcomes.cleaning = heard == nil ? .nothingKept : .done
            next.calls[id] = call
            return (next, commit(id, call, raw: raw))

        case let .committed(id, succeeded):
            return committed(state, id: id, succeeded: succeeded)

        case let .published(ids):
            for id in ids where state.calls[id].map({ $0.stage == .finalized || $0.stage == .failed }) == true {
                next.calls[id]?.published = true
            }
            return (next, nil)

        case .inputEnded:
            next.inputEnded = true
            return (next, nil)

        case .shutdown:
            guard !state.shuttingDown else { return (state, nil) }
            next.shuttingDown = true
            var commits: [String: TranscriptCommit<Raw, Names, Far, Heard>] = [:]
            for (id, var call) in state.calls where call.stage == .cleaning {
                guard let raw = call.raw else { continue }
                call.stage = .committing
                call.outcomes.cleaning = .skipped
                next.calls[id] = call
                commits[id] = .init(raw: raw, names: call.names, far: call.far, heard: nil, outcomes: call.outcomes)
            }
            return (next, commits.isEmpty ? nil : .stopCleaning(commits))
        }
    }

    private func commit(_ id: String, _ call: State.Call, raw: Raw) -> Effect {
        .commit(call: id, raw, call.names, call.far, call.heard, call.outcomes)
    }

    private func committed(_ state: State, id: String, succeeded: Bool) -> (State, Effect?) {
        guard var call = state.calls[id], call.stage == .committing else { return (state, nil) }
        var next = state
        // A failed replacement leaves the saved far side and original microphone text.
        if !succeeded { call.heard = nil }
        call.stage = .finalized
        next.calls[id] = call
        return (next, publish(id, call, finalWrite: true))
    }

    private func publish(_ id: String, _ call: State.Call, finalWrite: Bool) -> Effect {
        .publish([id: final(call, finalWrite: finalWrite)])
    }

    private func final(_ call: State.Call, finalWrite: Bool) -> FinalTranscript<Entry> {
        let rows = call.raw.map { entries($0, call.far, call.heard) } ?? []
        return .init(entries: rows, usable: !rows.isEmpty, finalWrite: finalWrite)
    }
}
