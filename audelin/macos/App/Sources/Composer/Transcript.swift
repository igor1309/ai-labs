import CallText
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

    /// Live names go to the file as tentative speakers; the after-call pass replaces them.
    static func speakers(_ names: LiveNameBoard.Names) -> [TranscriptFormat.Speaker] {

        names.order.map { .init(id: names.ids[$0]!, name: $0, state: names.confirmed ? "confirmed" : "tentative") }
    }
}
