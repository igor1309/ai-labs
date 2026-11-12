import CallDiarizer
import CallText
import LiveText
import SpeakerAttribution
import TranscriptFormat

enum Transcript {

    static func segments(from state: CallState) -> [TranscriptFormat.Segment] {

        state.entries.map { segment(from: $0) }
    }

    static func segment(from entry: CallState.Entry, speaker: String? = nil) -> TranscriptFormat.Segment {

        TranscriptFormat.Segment(
            side: entry.speaker == .mine ? .mine : .theirs,
            start: entry.text.start,
            settled: entry.text.settledText,
            pending: entry.text.pendingText,
            filledInLater: entry.writtenLater,
            speaker: entry.speaker == .mine ? nil : speaker
        )
    }

    static func replacingMicrophone(
        in state: CallState, with heard: [TranscriptSegment], names: LiveNameBoard.Names? = nil
    ) -> [TranscriptFormat.Segment] {

        let call = state.entries.filter { $0.speaker == .theirs }.map { entry in
            segment(from: entry, speaker: names.flatMap { board in board.rows[entry.text.id].flatMap { board.ids[$0] } })
        }
        let microphone = heard.map {
            TranscriptFormat.Segment(side: .mine, start: $0.start, settled: $0.settledText, pending: $0.pendingText)
        }
        return (call + microphone).sorted { $0.start < $1.start }
    }

    /// The far side after the call, given to its diarized speakers. Each speaker's ID is
    /// `d` and its cluster number, listed in order of first speech so the file numbers
    /// them `Them 1`, `Them 2`… as they spoke.
    typealias Attributed = AttributedFar

    /// `names`: each diarized speaker the Zoom evidence confirmed.
    static func attributed(_ pieces: [SpeakerAttribution.Piece<TranscriptSegment>], in state: CallState,
                           names: [Int: String] = [:]) -> Attributed {

        let later = Dictionary(state.entries.filter { $0.speaker == .theirs }.map { ($0.text.id, $0.writtenLater) }, uniquingKeysWith: { $0 || $1 })
        var speakers: [TranscriptFormat.Speaker] = []
        let far = pieces.map { piece in
            let id = piece.speaker.map { "d\($0)" }
            if let speaker = piece.speaker, let id, !speakers.contains(where: { $0.id == id }) {
                let name = names[speaker]
                speakers.append(.init(id: id, name: name, state: name == nil ? "diarized" : "confirmed"))
            }
            return TranscriptFormat.Segment(
                side: .theirs, start: piece.segment.start, settled: piece.segment.settledText, pending: piece.segment.pendingText,
                filledInLater: later[piece.segment.id] ?? false, speaker: id
            )
        }
        return Attributed(far: far, speakers: speakers)
    }

    /// Each far row's speaker as its 1-based place in `speakers`: the one whose diarized turns
    /// overlap the row most, the earlier place on a tie. Empty for a lone speaker, who stays
    /// plain Them.
    static func rowSpeakers(rows: [(id: Int, start: Double, end: Double)], turns: [CallDiarizer.Turn],
                            speakers: [TranscriptFormat.Speaker]) -> [Int: Int] {

        guard speakers.count > 1 else { return [:] }
        var result: [Int: Int] = [:]
        for row in rows {
            var spoken: [Int: Double] = [:]
            for turn in turns {
                guard let index = speakers.firstIndex(where: { $0.id == "d\(turn.speaker)" }) else { continue }
                let overlap = min(row.end, turn.end) - max(row.start, turn.start)
                if overlap > 0 { spoken[index + 1, default: 0] += overlap }
            }
            result[row.id] = spoken.max { $0.value == $1.value ? $0.key > $1.key : $0.value < $1.value }?.key
        }
        return result
    }

    /// The microphone's rows with an attributed far side, in time order.
    static func merging(_ microphone: [TranscriptFormat.Segment], with far: [TranscriptFormat.Segment]) -> [TranscriptFormat.Segment] {

        (microphone + far).sorted { $0.start < $1.start }
    }

    /// Live names go to the file as tentative speakers; the after-call pass replaces them.
    static func speakers(_ names: LiveNameBoard.Names) -> [TranscriptFormat.Speaker] {

        names.order.map { .init(id: names.ids[$0]!, name: $0, state: names.confirmed ? "confirmed" : "tentative") }
    }
}

/// The far side after the call, given to its diarized speakers (`Transcript.attributed`).
public struct AttributedFar: Sendable, Equatable {

    public var far: [TranscriptFormat.Segment]
    public var speakers: [TranscriptFormat.Speaker]
    /// Each far row's speaker as its 1-based place in `speakers` (`Transcript.rowSpeakers`).
    public var rows: [Int: Int] = [:]
}
