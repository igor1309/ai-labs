import CallDiarizer
import Foundation
import SpeakerAttribution

extension TranscriptSegment: SpeakerSegment {
    public var wordTimes: [SpeakerAttribution.WordTime] {
        words.map { .init(start: $0.start, end: $0.end) }
    }

    public func piece(words: Range<Int>, start: Double, end: Double) -> Self {
        Self(
            id: id, start: start, end: end, words: Array(self.words[words]),
            settledCount: max(0, min(settledCount, words.upperBound) - words.lowerBound)
        )
    }
}

/// The far side of a closed call, given to its remote speakers.
struct RemoteSpeakers: Sendable {
    private let diarizer: CallDiarizer
    private let sink: any LogSink

    init(diarizer: CallDiarizer, sink: any LogSink) {
        self.diarizer = diarizer; self.sink = sink
    }

    struct Attribution: Sendable {

        let turns: [CallDiarizer.Turn]
        let pieces: [SpeakerAttribution.Piece<TranscriptSegment>]
    }

    /// nil when diarizing failed: the far side stays plain "Them".
    func attribute(_ state: CallState, track: URL, speakers: Int?) async -> Attribution? {
        do {
            try Task.checkCancellation()
            let result = try await diarizer.diarize(track, speakers: speakers)
            try Task.checkCancellation()
            let pieces = SpeakerAttribution().attribute(
                state.entries.filter { $0.speaker == .theirs }.map(\.text),
                turns: result.turns.map { .init(speaker: $0.speaker, start: $0.start, end: $0.end) }
            )
            let model = result.model == .nemotron ? "nemotron" : "vbx"
            let count = Set(pieces.compactMap(\.speaker)).count
            sink.write(.init(category: .session, message: "remote speakers model=\(model) turns=\(result.turns.count) speakers=\(count)"))
            return Attribution(turns: result.turns, pieces: pieces)
        } catch is CancellationError {
            return nil
        } catch {
            guard !Task.isCancelled else { return nil }
            sink.write(.init(category: .session, message: "remote speakers failed: \(error)"))
            return nil
        }
    }
}
