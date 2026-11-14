import BleedCleanup
import Foundation

public struct CleanupRecording: Equatable, Sendable {
    public let microphoneURL: URL
    public let callURL: URL

    public init(microphoneURL: URL, callURL: URL) {
        self.microphoneURL = microphoneURL; self.callURL = callURL
    }
}

/// Applies the bleed gate and hears the cleaned microphone without changing the file.
struct TranscriptCleanup: Sendable {
    let recording: CleanupRecording
    let duration: @Sendable () -> Double
    let cleaning: any MicrophoneCleaning<CleanupRecording, [Float]>
    let hearing: any CleanedHearing<[Float], [TranscriptSegment]>
    let sink: any LogSink

    func run(_ raw: CallState) async -> [TranscriptSegment]? {
        let replacement = CleanupReplacement()
        let cleanup = BleedCleanup(
            gate: BleedGate(), cleaning: cleaning,
            hearing: NonemptyHearing(base: hearing), replacing: replacement
        )
        let outcome = await LoggingCleanup(base: cleanup, sink: sink).run(
            recording: recording,
            microphone: words(in: raw, speaker: .mine), call: words(in: raw, speaker: .theirs), duration: duration()
        )
        if case .replaced = outcome {
            return await replacement.heard
        }
        return nil
    }

    private func words(in state: CallState, speaker: CallState.Speaker) -> [Word] {
        state.entries.filter { $0.speaker == speaker }.flatMap { entry in
            entry.text.words.map { Word(start: $0.start, text: $0.text) }
        }
    }
}

private actor CleanupReplacement: MicrophoneReplacing {
    private(set) var heard: [TranscriptSegment]?

    func replaceMicrophone(of recording: CleanupRecording, with text: [TranscriptSegment]) async throws {
        try Task.checkCancellation()
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
