import Testing
import TranscriptFinalization

struct TranscriptFinalizationShutdownTests {

    @Test func shutdownWithNoWorkIsSettled_state() { assert(makeState(inputEnded: true), .shutdown) { $0.shuttingDown = true; $0.settled = true } }
    @Test func shutdownWithNoWorkIsSettled_effect() { assert(makeState(inputEnded: true), .shutdown, delivers: nil) }

    @Test func inputEndedBeforeShutdownDoesNotSettle_state() {
        assert(makeState(), .inputEnded) { $0.inputEnded = true }
        assert(makeState(makeCall(.finalized, published: true)), .inputEnded) { $0.inputEnded = true }
    }
    @Test func inputEndedBeforeShutdownDoesNotSettle_effect() {
        assert(makeState(), .inputEnded, delivers: nil)
        assert(makeState(makeCall(.finalized, published: true)), .inputEnded, delivers: nil)
    }

    @Test func shutdownWaitsForInputToEnd_state() {
        assert(makeState(), .shutdown) { $0.shuttingDown = true }
        assert(makeState(makeCall(.finalized, published: true)), .shutdown) { $0.shuttingDown = true }
    }
    @Test func shutdownWaitsForInputToEnd_effect() {
        assert(makeState(), .shutdown, delivers: nil)
        assert(makeState(makeCall(.finalized, published: true)), .shutdown, delivers: nil)
    }

    @Test func inputEndedAfterShutdownSettlesPublishedCalls_state() {
        assert(makeState(shuttingDown: true), .inputEnded) { $0.inputEnded = true; $0.settled = true }
        assert(makeState(makeCall(.finalized, published: true), shuttingDown: true), .inputEnded) {
            $0.inputEnded = true; $0.settled = true
        }
    }
    @Test func inputEndedAfterShutdownSettlesPublishedCalls_effect() {
        assert(makeState(shuttingDown: true), .inputEnded, delivers: nil)
        assert(makeState(makeCall(.finalized, published: true), shuttingDown: true), .inputEnded, delivers: nil)
    }

    @Test(arguments: [State.Stage.writing, .diarizing, .cleaning, .committing, .finalized, .failed])
    func inputEndedWaitsForPublication_state(stage: State.Stage) {
        assert(makeState(makeCall(stage), shuttingDown: true), .inputEnded) { $0.inputEnded = true }
    }
    @Test(arguments: [State.Stage.writing, .diarizing, .cleaning, .committing, .finalized, .failed])
    func inputEndedWaitsForPublication_effect(stage: State.Stage) {
        assert(makeState(makeCall(stage), shuttingDown: true), .inputEnded, delivers: nil)
    }

    @Test func publishedCallStillWaitsForInputToEnd_state() {
        assert(makeState(makeCall(.finalized), shuttingDown: true), .published(calls: [callID])) {
            $0.calls[callID]?.published = true
        }
    }
    @Test func publishedCallStillWaitsForInputToEnd_effect() {
        assert(makeState(makeCall(.finalized), shuttingDown: true), .published(calls: [callID]), delivers: nil)
    }

    @Test func callCanOpenAndSaveAfterShutdown_state() {
        assert(makeState(shuttingDown: true), .opened(call: callID)) { $0.calls[callID] = makeCall(saved: false, raw: nil) }
        assert(makeState(makeCall(saved: false, raw: nil), shuttingDown: true), .wrote(call: callID, "saved")) {
            $0.calls[callID]?.raw = "saved"; $0.calls[callID]?.latestWriteSucceeded = true
        }
    }
    @Test func callCanOpenAndSaveAfterShutdown_effect() {
        assert(makeState(shuttingDown: true), .opened(call: callID), delivers: nil)
        assert(makeState(makeCall(saved: false, raw: nil), shuttingDown: true), .wrote(call: callID, "saved"), delivers: nil)
    }

    @Test func repeatedInputEndedIsIgnored_state() {
        assert(makeState(inputEnded: true), .inputEnded)
        assert(makeState(shuttingDown: true, inputEnded: true, settled: true), .inputEnded)
    }
    @Test func repeatedInputEndedIsIgnored_effect() {
        assert(makeState(inputEnded: true), .inputEnded, delivers: nil)
        assert(makeState(shuttingDown: true, inputEnded: true, settled: true), .inputEnded, delivers: nil)
    }

    /// A call still being written is closed by the recording's own stop; its final form is still to come.
    @Test func writingCallHoldsSettling_state() { assert(makeState(makeCall(), inputEnded: true), .shutdown) { $0.shuttingDown = true } }
    @Test func writingCallHoldsSettling_effect() { assert(makeState(makeCall(), inputEnded: true), .shutdown, delivers: nil) }

    @Test func publishedCallsSettle_state() {
        assert(makeState(makeCall(.finalized), inputEnded: true), .shutdown) { $0.shuttingDown = true }
        assert(makeState(makeCall(.finalized, published: true), inputEnded: true), .shutdown) { $0.shuttingDown = true; $0.settled = true }
    }
    @Test func publishedCallsSettle_effect() {
        assert(makeState(makeCall(.finalized), inputEnded: true), .shutdown, delivers: nil)
        assert(makeState(makeCall(.finalized, published: true), inputEnded: true), .shutdown, delivers: nil)
    }

    /// Publication is what settles: the last final call published settles the machine.
    @Test(arguments: [State.Stage.finalized, .failed])
    func publicationSettles_state(stage: State.Stage) {
        assert(makeState(makeCall(stage), shuttingDown: true, inputEnded: true), .published(calls: [callID])) {
            $0.calls[callID]?.published = true
            $0.settled = true
        }
    }
    @Test(arguments: [State.Stage.finalized, .failed])
    func publicationSettles_effect(stage: State.Stage) {
        assert(makeState(makeCall(stage), shuttingDown: true, inputEnded: true), .published(calls: [callID]), delivers: nil)
    }

    @Test func publicationOfOneCallLeavesAnotherUnsettled() {
        let state = State(calls: ["a": makeCall(.finalized), "b": makeCall(.finalized)], shuttingDown: true, inputEnded: true)
        assert(state, .published(calls: ["a"])) { $0.calls["a"]?.published = true }
        assert(state, .published(calls: ["a"]), delivers: nil)
    }

    @Test func cleaningCallCommitsAsWritten_state() {
        assert(makeState(makeCall(.cleaning, names: "names", far: "far", outcomes: .init(split: .done(diarizer: "vbx")))), .shutdown) {
            $0.shuttingDown = true
            $0.calls[callID]?.stage = .committing
            $0.calls[callID]?.outcomes.cleaning = .skipped
        }
    }
    @Test func cleaningCallCommitsAsWritten_effect() {
        assert(makeState(makeCall(.cleaning, names: "names", far: "far", outcomes: .init(split: .done(diarizer: "vbx")))), .shutdown,
               delivers: .stopCleaning([callID: commit(names: "names", far: "far", outcomes: .init(split: .done(diarizer: "vbx"), cleaning: .skipped))]))
    }

    /// Diarizing and committing replace the file; the final form waits for that write.
    @Test(arguments: [State.Stage.diarizing, .committing])
    func fileReplacementHoldsSettling_state(stage: State.Stage) {
        assert(makeState(makeCall(stage, heard: "h"), inputEnded: true), .shutdown) { $0.shuttingDown = true }
    }
    @Test(arguments: [State.Stage.diarizing, .committing])
    func fileReplacementHoldsSettling_effect(stage: State.Stage) {
        assert(makeState(makeCall(stage, heard: "h"), inputEnded: true), .shutdown, delivers: nil)
    }

    @Test func diarizedAfterShutdownCommitsWithoutCleaning_state() {
        assert(makeState(makeCall(.diarizing), shuttingDown: true), .diarized(call: callID, .init(far: "far", diarizer: "nemotron"))) {
            $0.calls[callID]?.stage = .committing
            $0.calls[callID]?.outcomes = .init(split: .done(diarizer: "nemotron"), cleaning: .skipped)
            $0.calls[callID]?.far = "far"
        }
    }
    @Test func diarizedAfterShutdownCommitsWithoutCleaning_effect() {
        assert(makeState(makeCall(.diarizing), shuttingDown: true), .diarized(call: callID, .init(far: "far", diarizer: "nemotron")), delivers: .commit(call: callID, "raw", nil, "far", nil, .init(split: .done(diarizer: "nemotron"), cleaning: .skipped)))
    }

    @Test func committedAfterShutdownIsFinal_state() {
        assert(makeState(makeCall(.committing, heard: "h"), shuttingDown: true), .committed(call: callID, succeeded: true)) {
            $0.calls[callID]?.stage = .finalized
        }
    }
    @Test func committedAfterShutdownIsFinal_effect() {
        assert(makeState(makeCall(.committing, heard: "h"), shuttingDown: true), .committed(call: callID, succeeded: true), delivers: published())
    }

    @Test func closedAfterShutdownCommitsWithoutDiarizing_state() {
        assert(makeState(makeCall(), shuttingDown: true), .closed(call: callID, names: "names")) {
            $0.calls[callID]?.stage = .committing
            $0.calls[callID]?.outcomes = .init(split: .skipped, cleaning: .skipped)
            $0.calls[callID]?.names = "names"
        }
    }
    @Test func closedAfterShutdownCommitsWithoutDiarizing_effect() {
        assert(makeState(makeCall(), shuttingDown: true), .closed(call: callID, names: "names"), delivers: .commit(call: callID, "raw", "names", nil, nil, .init(split: .skipped, cleaning: .skipped)))
    }

    /// A cleanup result that arrives after its call was settled is dropped.
    @Test func lateCleanupIsIgnored_state() {
        assert(makeState(makeCall(.finalized, published: true), shuttingDown: true, inputEnded: true, settled: true), .cleaned(call: callID, "heard"))
    }
    @Test func lateCleanupIsIgnored_effect() {
        assert(makeState(makeCall(.finalized, published: true), shuttingDown: true, inputEnded: true, settled: true), .cleaned(call: callID, "heard"), delivers: nil)
    }

    @Test func repeatedShutdownIsIgnored_state() {
        let state = State(calls: [callID: makeCall(.finalized, published: true)], shuttingDown: true, inputEnded: true, settled: true)
        assert(state, .shutdown)
    }
    @Test func repeatedShutdownIsIgnored_effect() {
        assert(State(calls: [callID: makeCall(.finalized, published: true)], shuttingDown: true, inputEnded: true, settled: true), .shutdown, delivers: nil)
    }

    @Test func shutdownCommitsEveryCleaningCall() {
        let (sut, spy) = makeSUT(stub: ["e"])
        let state = State(calls: ["a": makeCall(.cleaning, raw: "ra"), "b": makeCall(.cleaning, raw: "rb", far: "fb"), "c": makeCall(.diarizing)])
        let effect = sut.reduce(state, .shutdown).1
        #expect(effect == .stopCleaning(["a": commit("ra", outcomes: .init(cleaning: .skipped)),
                                         "b": commit("rb", far: "fb", outcomes: .init(cleaning: .skipped))]))
        #expect(spy.requests.isEmpty)
    }
}
