/// Finds a closed call's remote speakers and saves them in its transcript.
public protocol TranscriptDiarizing<Raw, Names, Far>: Sendable {
    associatedtype Raw: Equatable & Sendable
    associatedtype Names: Equatable & Sendable
    associatedtype Far: Equatable & Sendable
    /// Saves the far side given to its speakers with `outcomes` plus the split's own, and
    /// returns what it saved and by which diarizer; nil when the pass saved nothing.
    func diarize(call: String, _ raw: Raw, evidence: Names, outcomes: FinishingOutcomes) async -> SavedDiarization<Far>?
}

/// Hears a closed call's microphone side again from audio cleaned of the far side's bleed.
public protocol MicrophoneCleanup<Raw, Far, Heard>: Sendable {
    associatedtype Raw: Equatable & Sendable
    associatedtype Far: Equatable & Sendable
    associatedtype Heard: Equatable & Sendable
    /// The microphone side heard again; nil when cleanup keeps it as written.
    func clean(call: String, _ raw: Raw, far: Far?) async -> Heard?
    /// Stops the call's cleanup; a clean still running returns nil.
    func stop(call: String) async
}

/// Replaces a closed transcript's microphone side.
public protocol TranscriptReplacement<Raw, Names, Far, Heard>: Sendable {
    associatedtype Raw: Equatable & Sendable
    associatedtype Names: Equatable & Sendable
    associatedtype Far: Equatable & Sendable
    associatedtype Heard: Equatable & Sendable
    /// Replaces atomically, with `outcomes` beside the text; a failure keeps the file's previous bytes.
    /// `names` are the ones taken at close; a nil `heard` keeps the microphone side as written.
    func replace(call: String, _ raw: Raw, names: Names?, far: Far?, heard: Heard?, outcomes: FinishingOutcomes) async throws
}

/// Takes each call's final transcript.
public protocol FinalTranscripts<Entry>: Sendable {
    associatedtype Entry: Equatable & Sendable
    func publish(_ finals: [String: FinalTranscript<Entry>]) async
}

/// Hands each effect to its collaborator and answers with the event its result means; it keeps nothing.
public struct TranscriptFinalizationEffectHandler<Raw: Equatable & Sendable, Names: Equatable & Sendable, Far: Equatable & Sendable, Heard: Equatable & Sendable, Entry: Equatable & Sendable>: Sendable {

    public typealias Event = TranscriptFinalizationEvent<Raw, Names, Far, Heard>
    public typealias Effect = TranscriptFinalizationEffect<Raw, Names, Far, Heard, Entry>

    private let diarizing: any TranscriptDiarizing<Raw, Names, Far>
    private let cleanup: any MicrophoneCleanup<Raw, Far, Heard>
    private let replacement: any TranscriptReplacement<Raw, Names, Far, Heard>
    private let finals: any FinalTranscripts<Entry>

    public init(
        diarizing: any TranscriptDiarizing<Raw, Names, Far>, cleanup: any MicrophoneCleanup<Raw, Far, Heard>,
        replacement: any TranscriptReplacement<Raw, Names, Far, Heard>, finals: any FinalTranscripts<Entry>
    ) {
        self.diarizing = diarizing; self.cleanup = cleanup; self.replacement = replacement; self.finals = finals
    }

    /// Delivers each result as it completes, including each shutdown replacement.
    public func handle(_ effect: Effect) -> AsyncStream<Event> {
        AsyncStream { output in
            let work = Task {
                await handle(effect, output: output)
                output.finish()
            }
            output.onTermination = { _ in work.cancel() }
        }
    }

    private func handle(_ effect: Effect, output: AsyncStream<Event>.Continuation) async {
        switch effect {
        case let .diarize(call, raw, evidence, outcomes):
            output.yield(.diarized(call: call, await diarizing.diarize(call: call, raw, evidence: evidence, outcomes: outcomes)))
        case let .clean(call, raw, far):
            output.yield(.cleaned(call: call, await cleanup.clean(call: call, raw, far: far)))
        case let .commit(call, raw, names, far, heard, outcomes):
            do {
                try await replacement.replace(call: call, raw, names: names, far: far, heard: heard, outcomes: outcomes)
                output.yield(.committed(call: call, succeeded: true))
            } catch {
                output.yield(.committed(call: call, succeeded: false))
            }
        case let .publish(transcripts):
            await finals.publish(transcripts)
            output.yield(.published(calls: Set(transcripts.keys)))
        case let .commitOnShutdown(stoppingCleanup, commits):
            for call in stoppingCleanup.sorted() { await cleanup.stop(call: call) }
            for (call, commit) in commits.sorted(by: { $0.key < $1.key }) {
                do {
                    try await replacement.replace(call: call, commit.raw, names: commit.names, far: commit.far,
                                                  heard: commit.heard, outcomes: commit.outcomes)
                    output.yield(.committed(call: call, succeeded: true))
                } catch { output.yield(.committed(call: call, succeeded: false)) }
            }
        }
    }
}
