import TranscriptFormat

extension Transcript {
    /// The supplied far side and names belong to the call being replaced.
    static func microphoneReplacement(
        in state: CallState, far: Attributed?, names: LiveNameBoard.Names, heard: [TranscriptSegment]
    ) -> (segments: [TranscriptFormat.Segment], speakers: [TranscriptFormat.Speaker]) {
        if let far {
            let microphone = heard.map {
                TranscriptFormat.Segment(side: .mine, start: $0.start, settled: $0.settledText, pending: $0.pendingText)
            }
            return (merging(microphone, with: far.far), far.speakers)
        }
        return (replacingMicrophone(in: state, with: heard, names: names), speakers(names))
    }
}
