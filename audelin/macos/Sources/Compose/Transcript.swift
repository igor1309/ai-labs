import CallText
import TranscriptFile

public enum Transcript {

    public static func segments(from state: State) -> [TranscriptFile.Segment] {

        state.entries.map { entry in
            TranscriptFile.Segment(
                side: entry.speaker == .mine ? .mine : .theirs,
                start: entry.text.start, settled: entry.text.settled,
                pending: entry.text.pending, filledInLater: entry.writtenLater
            )
        }
    }
}
