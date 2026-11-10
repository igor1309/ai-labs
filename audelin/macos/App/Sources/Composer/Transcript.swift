import CallText
import TranscriptFormat

enum Transcript {

    static func segments(from state: CallState) -> [TranscriptFormat.Segment] {

        state.entries.map { segment(from: $0) }
    }

    static func segment(from entry: CallState.Entry, speaker: String? = nil) -> TranscriptFormat.Segment {

        TranscriptFormat.Segment(
            side: entry.speaker == .mine ? .mine : .theirs,
            start: entry.text.start, settled: entry.text.settled,
            pending: entry.text.pending, filledInLater: entry.writtenLater,
            speaker: entry.speaker == .mine ? nil : speaker
        )
    }

    /// Live names go to the file as tentative speakers; the after-call pass replaces them.
    static func speakers(_ names: LiveNameBoard.Names) -> [TranscriptFormat.Speaker] {

        names.order.map { .init(id: names.ids[$0]!, name: $0, state: names.confirmed ? "confirmed" : "tentative") }
    }
}
