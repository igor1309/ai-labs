import BleedCleanup
import Foundation
import SummaryJobs

public struct CleanupRecording: Equatable, Sendable {
    public let microphoneURL: URL
    public let callURL: URL

    public init(microphoneURL: URL, callURL: URL) {
        self.microphoneURL = microphoneURL; self.callURL = callURL
    }
}

/// Runs on the closed snapshot; the summary follows the successful atomic replacement.
struct TranscriptCleanup: Sendable {
    let recording: CleanupRecording
    let duration: @Sendable () -> Double
    let cleaning: any MicrophoneCleaning<CleanupRecording, [Float]>
    let hearing: any CleanedHearing<[Float], [TranscriptSegment]>
    let sink: any LogSink

    func run(_ raw: CallState, attributed: Transcript.Attributed? = nil, replacing replace: @escaping @Sendable ([TranscriptSegment]) async throws -> Void) async -> [Job.Entry] {
        let replacement = CleanupReplacement(replace: replace)
        let cleanup = BleedCleanup(
            gate: BleedGate(), cleaning: cleaning,
            hearing: NonemptyHearing(base: hearing), replacing: replacement
        )
        let outcome = await LoggingCleanup(base: cleanup, sink: sink).run(
            recording: recording,
            microphone: words(in: raw, speaker: .mine), call: words(in: raw, speaker: .theirs), duration: duration()
        )
        if case .replaced = outcome {
            return summaryEntries(raw, heard: await replacement.heard, attributed: attributed)
        }
        return summaryEntries(raw, attributed: attributed)
    }

    private func words(in state: CallState, speaker: CallState.Speaker) -> [Word] {
        state.entries.filter { $0.speaker == speaker }.flatMap { entry in
            entry.text.words.map { Word(start: $0.start, text: $0.text) }
        }
    }
}

private actor CleanupReplacement: MicrophoneReplacing {
    let replace: @Sendable ([TranscriptSegment]) async throws -> Void
    private(set) var heard: [TranscriptSegment] = []

    init(replace: @escaping @Sendable ([TranscriptSegment]) async throws -> Void) { self.replace = replace }

    func replaceMicrophone(of recording: CleanupRecording, with text: [TranscriptSegment]) async throws {
        try Task.checkCancellation()
        try await replace(text)
        heard = text
    }
}

private struct NonemptyHearing: CleanedHearing {
    let base: any CleanedHearing<[Float], [TranscriptSegment]>

    func hear(_ samples: [Float]) async throws -> [TranscriptSegment]? {
        try Task.checkCancellation()
        guard let text = try await base.hear(samples), text.contains(where: { !$0.words.isEmpty }) else { return nil }
        try Task.checkCancellation()
        return text
    }
}

private struct LoggingCleanup: Sendable {
    let base: BleedCleanup<CleanupRecording, [Float], [TranscriptSegment]>
    let sink: any LogSink

    func run(recording: CleanupRecording, microphone: [Word], call: [Word], duration: Double) async -> CleanupOutcome {
        let outcome = await base.run(recording: recording, microphone: microphone, call: call, duration: duration)
        switch outcome {
        case .replaced: break
        case .kept(.noBleedFound):
            sink.write(.init(category: .session, message: "bleed cleanup kept raw: no bleed found", level: .debug))
        case .kept(.nothingHeard):
            sink.write(.init(category: .session, message: "bleed cleanup kept raw: nothing heard"))
        case let .kept(.failed(step, error)):
            sink.write(.init(category: .session, message: "bleed cleanup kept raw: \(step) failed", error: String(describing: error)))
        }
        return outcome
    }
}
