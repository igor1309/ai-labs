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

    public static func feed(_ updates: AsyncStream<State>, to file: TranscriptFile) async throws {

        for await state in updates {
            try Task.checkCancellation()
            try await file.write(segments(from: state))
        }
        try Task.checkCancellation()
    }
}
