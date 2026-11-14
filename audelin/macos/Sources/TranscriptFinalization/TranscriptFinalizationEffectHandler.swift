/// Finds a closed call's remote speakers and saves them in its transcript.
public protocol TranscriptDiarizing<Raw, Far>: Sendable {
    associatedtype Raw: Equatable & Sendable
    associatedtype Far: Equatable & Sendable
    /// The far side given to its speakers, already in the file; nil when the pass found none or failed.
    func diarize(call: String, _ raw: Raw) async -> Far?
}

/// Hears a closed call's microphone side again from audio cleaned of the far side's bleed.
public protocol MicrophoneCleanup<Raw, Far, Heard>: Sendable {
    associatedtype Raw: Equatable & Sendable
    associatedtype Far: Equatable & Sendable
    associatedtype Heard: Equatable & Sendable
    /// The microphone side heard again; nil when cleanup keeps it as written.
    func clean(call: String, _ raw: Raw, far: Far?) async -> Heard?
}

/// Replaces a closed transcript's microphone side.
public protocol TranscriptReplacement<Raw, Names, Far, Heard>: Sendable {
    associatedtype Raw: Equatable & Sendable
    associatedtype Names: Equatable & Sendable
    associatedtype Far: Equatable & Sendable
    associatedtype Heard: Equatable & Sendable
    /// Replaces atomically; a failure keeps the file's previous bytes.
    /// `names` are the ones taken at close.
    func replace(call: String, _ raw: Raw, names: Names?, far: Far?, heard: Heard) async throws
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

    private let diarizing: any TranscriptDiarizing<Raw, Far>
    private let cleanup: any MicrophoneCleanup<Raw, Far, Heard>
    private let replacement: any TranscriptReplacement<Raw, Names, Far, Heard>
    private let finals: any FinalTranscripts<Entry>

    public init(
        diarizing: any TranscriptDiarizing<Raw, Far>, cleanup: any MicrophoneCleanup<Raw, Far, Heard>,
        replacement: any TranscriptReplacement<Raw, Names, Far, Heard>, finals: any FinalTranscripts<Entry>
    ) {
        self.diarizing = diarizing; self.cleanup = cleanup; self.replacement = replacement; self.finals = finals
    }

    /// The event that completes the effect; none for a publication.
    public func handle(_ effect: Effect) async -> Event? {
        switch effect {
        case let .diarize(call, raw):
            return .diarized(call: call, await diarizing.diarize(call: call, raw))
        case let .clean(call, raw, far):
            return .cleaned(call: call, await cleanup.clean(call: call, raw, far: far))
        case let .commit(call, raw, names, far, heard):
            do {
                try await replacement.replace(call: call, raw, names: names, far: far, heard: heard)
                return .committed(call: call, succeeded: true)
            } catch {
                return .committed(call: call, succeeded: false)
            }
        case let .publish(transcripts):
            await finals.publish(transcripts)
            return nil
        }
    }
}
