import Testing
import TranscriptFinalization

struct TranscriptFinalizationOutcomesTests {
    @Test(arguments: ["nemotron", "vbx"])
    func savedDiarizerIsKept_state(diarizer: String) {
        assert(makeState(makeCall(.diarizing)), .diarized(call: callID, .init(far: "split", diarizer: diarizer))) {
            $0.calls[callID]?.stage = .cleaning; $0.calls[callID]?.far = "split"
            $0.calls[callID]?.outcomes.split = .done(diarizer: diarizer)
        }
    }
    @Test(arguments: ["nemotron", "vbx"])
    func savedDiarizerIsKept_effect(diarizer: String) {
        assert(makeState(makeCall(.diarizing)), .diarized(call: callID, .init(far: "split", diarizer: diarizer)),
               delivers: .clean(call: callID, "raw", "split"))
    }

    @Test(arguments: [false, true])
    func noSavedSplitIsNotKept_state(namesSaved: Bool) {
        assert(makeState(makeCall(.diarizing)), .diarized(call: callID, namesSaved ? .init(far: "named", diarizer: nil) : nil)) {
            $0.calls[callID]?.stage = .cleaning; $0.calls[callID]?.far = namesSaved ? "named" : nil
            $0.calls[callID]?.outcomes.split = .nothingKept
        }
    }
    @Test(arguments: [false, true])
    func noSavedSplitIsNotKept_effect(namesSaved: Bool) {
        assert(makeState(makeCall(.diarizing)), .diarized(call: callID, namesSaved ? .init(far: "named", diarizer: nil) : nil),
               delivers: .clean(call: callID, "raw", namesSaved ? "named" : nil))
    }

    @Test(arguments: [false, true])
    func cleanupCommitsTheSplitAndItsOutcome_state(heard: Bool) {
        assert(makeState(makeCall(.cleaning, far: "split", outcomes: .init(split: .done(diarizer: "vbx")))), .cleaned(call: callID, heard ? "heard" : nil)) {
            $0.calls[callID]?.stage = .committing; $0.calls[callID]?.heard = heard ? "heard" : nil
            $0.calls[callID]?.outcomes.cleaning = heard ? .done : .nothingKept
        }
    }
    @Test(arguments: [false, true])
    func cleanupCommitsTheSplitAndItsOutcome_effect(heard: Bool) {
        assert(makeState(makeCall(.cleaning, far: "split", outcomes: .init(split: .done(diarizer: "vbx")))), .cleaned(call: callID, heard ? "heard" : nil),
               delivers: .commit(call: callID, "raw", nil, "split", heard ? "heard" : nil,
                                 .init(split: .done(diarizer: "vbx"), cleaning: heard ? .done : .nothingKept)))
    }

    @Test func failedLatestWriteAfterShutdownNeverCommits_state() {
        assert(makeState(makeCall(saved: false), shuttingDown: true), .closed(call: callID, names: "names")) {
            $0.calls[callID]?.stage = .failed; $0.calls[callID]?.names = "names"
        }
    }
    @Test func failedLatestWriteAfterShutdownNeverCommits_effect() {
        assert(makeState(makeCall(saved: false), shuttingDown: true), .closed(call: callID, names: "names"), delivers: published(finalWrite: false))
    }

    @Test func stoppedCommitsPublishTogether_state() {
        let state = State(calls: ["a": makeCall(.committing), "b": makeCall(.committing, heard: "heard"), "c": makeCall(.diarizing)], shuttingDown: true)
        assert(state, .committedCalls(["a": true, "b": false, "c": true])) {
            $0.calls["a"]?.stage = .finalized; $0.calls["b"]?.stage = .finalized; $0.calls["b"]?.heard = nil
        }
    }
    @Test func stoppedCommitsPublishTogether_effect() {
        let state = State(calls: ["a": makeCall(.committing), "b": makeCall(.committing, heard: "heard"), "c": makeCall(.diarizing)], shuttingDown: true)
        assert(state, .committedCalls(["a": true, "b": false, "c": true]), delivers: .publish(["a": final(), "b": final()]))
    }
}
