import CallText
import TranscriptFile

enum Transcript {

    static func segments(from state: State) -> [TranscriptFile.Segment] {

        state.entries.map { segment(from: $0) }
    }

    static func segment(from entry: State.Entry, speaker: String? = nil) -> TranscriptFile.Segment {

        TranscriptFile.Segment(
            side: entry.speaker == .mine ? .mine : .theirs,
            start: entry.text.start, settled: entry.text.settled,
            pending: entry.text.pending, filledInLater: entry.writtenLater,
            speaker: entry.speaker == .mine ? nil : speaker
        )
    }

    /// Live names go to the file as tentative speakers; the after-call pass replaces them.
    static func speakers(_ names: LiveNameBoard.Names) -> [TranscriptFile.Speaker] {

        names.order.map { .init(id: names.ids[$0]!, name: $0, state: names.confirmed ? "confirmed" : "tentative") }
    }
}
