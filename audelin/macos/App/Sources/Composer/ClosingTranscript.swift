import TranscriptFile

/// Keeps the closed call's inputs for the legacy transcript and cleanup ports.
actor ClosingTranscript: SessionTranscriptFile {
    private let call: String
    private let writer: WritingTranscript
    private let pass: AfterCallPass
    private let names: LiveNameBoard
    private var last: CallState?
    private var closed = false
    private var closedNames: LiveNameBoard.Names?
    private var attributed: Composer.Transcript.Attributed?
    private var passed = false

    init(call: String, writer: WritingTranscript, pass: AfterCallPass, names: LiveNameBoard) {
        self.call = call; self.writer = writer; self.pass = pass; self.names = names
    }

    func write(_ state: CallState) async throws {
        guard !closed else { throw TranscriptFile.Failure.writingEnded }
        last = state
        try await writer.write(state)
    }

    func close() async {
        closedNames = names.snapshot()
        closed = true
        await writer.close()
    }

    func attributeSpeakers() async -> Composer.Transcript.Attributed? {
        guard attributed == nil else { return attributed }
        guard closed, !passed, let state = last, names.snapshot().callTrack != nil else { return nil }
        passed = true
        attributed = await pass.diarize(call: call, state)
        closedNames = names.snapshot()
        return attributed
    }

    func replaceMicrophone(in state: CallState, with segments: [TranscriptSegment]) async throws {
        let replacement = Composer.Transcript.microphoneReplacement(
            in: state, far: attributed, names: closedNames ?? names.snapshot(), heard: segments
        )
        try await writer.replaceWhole(replacement.segments, speakers: replacement.speakers)
    }
}
