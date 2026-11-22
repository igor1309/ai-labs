import CallNames
import TranscriptFormat

extension Transcript {
    /// The supplied far side and names belong to the call being replaced. Without a heard
    /// microphone side the words are kept as the file holds them: the saved split's rows, or
    /// else the live rows in their written order, so a commit that tells an outcome moves no row.
    static func microphoneReplacement(
        in state: CallState, far: Attributed?, names: CallNamesState, heard: [TranscriptSegment]?
    ) -> (segments: [TranscriptFormat.Segment], speakers: [TranscriptFormat.Speaker]) {
        if let far {
            let microphone = heard?.map {
                TranscriptFormat.Segment(side: .mine, start: $0.start, settled: $0.settledText, pending: $0.pendingText)
            }
            ?? state.entries.filter { $0.speaker == .mine }.map { segment(from: $0) }
            return (merging(microphone, with: far.far), far.speakers)
        }
        guard let heard else {
            let rows = state.entries.map { entry in
                segment(from: entry, speaker: names.rowNames[entry.text.id].flatMap { names.participantIDs[$0] })
            }
            return (rows, speakers(names))
        }
        return (replacingMicrophone(in: state, with: heard, names: names), speakers(names))
    }
}
