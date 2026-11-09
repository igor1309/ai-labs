import CallText
import TranscriptFile

enum Transcript {

    static func segments(from state: State) -> [TranscriptFile.Segment] {

        state.entries.map(segment(from:))
    }

    static func segment(from entry: State.Entry) -> TranscriptFile.Segment {

        TranscriptFile.Segment(
            side: entry.speaker == .mine ? .mine : .theirs,
            start: entry.text.start, settled: entry.text.settled,
            pending: entry.text.pending, filledInLater: entry.writtenLater
        )
    }
}
