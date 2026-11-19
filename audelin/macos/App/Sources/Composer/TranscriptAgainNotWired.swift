import Recordings

/// Answers Recordings' transcript-again port until compose wires Re-recognition:
/// every run ends at once as failed. No view sends a run yet.
struct TranscriptAgainNotWired: RecordingsTranscriptAgain {
    func run(id: String, request: Int) -> AsyncStream<TranscriptReport> {
        AsyncStream { output in
            output.yield(.failed("Not available yet."))
            output.finish()
        }
    }

    func stop(id: String, request: Int) async {}
}
