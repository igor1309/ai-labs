import Testing
import TranscriptFinalization

struct TranscriptFinalizationShutdownTests {

    @Test func shutdownWithNoWorkIsSettled_state() { assert(makeState(), .shutdown) { $0.shuttingDown = true; $0.settled = true } }
    @Test func shutdownWithNoWorkIsSettled_effect() { assert(makeState(), .shutdown, delivers: nil) }

    /// A call still being written is closed by the recording's own stop; its final form is still to come.
    @Test func writingCallHoldsSettling_state() { assert(makeState(makeCall()), .shutdown) { $0.shuttingDown = true } }
    @Test func writingCallHoldsSettling_effect() { assert(makeState(makeCall()), .shutdown, delivers: nil) }

    @Test func publishedCallsSettle_state() {
        assert(makeState(makeCall(.finalized)), .shutdown) { $0.shuttingDown = true }
        assert(makeState(makeCall(.finalized, published: true)), .shutdown) { $0.shuttingDown = true; $0.settled = true }
    }
    @Test func publishedCallsSettle_effect() { assert(makeState(makeCall(.finalized, published: true)), .shutdown, delivers: nil) }

    /// Publication is what settles: the last final call published settles the machine.
    @Test(arguments: [State.Stage.finalized, .failed])
    func publicationSettles_state(stage: State.Stage) {
        assert(makeState(makeCall(stage), shuttingDown: true), .published(calls: [callID])) {
            $0.calls[callID]?.published = true
            $0.settled = true
        }
    }
    @Test(arguments: [State.Stage.finalized, .failed])
    func publicationSettles_effect(stage: State.Stage) {
        assert(makeState(makeCall(stage), shuttingDown: true), .published(calls: [callID]), delivers: nil)
    }

    @Test func publicationOfOneCallLeavesAnotherUnsettled() {
        let state = State(calls: ["a": makeCall(.finalized), "b": makeCall(.finalized)], shuttingDown: true)
        assert(state, .published(calls: ["a"])) { $0.calls["a"]?.published = true }
        assert(state, .published(calls: ["a"]), delivers: nil)
    }

    @Test func cleaningCallIsFinalAsWritten_state() {
        assert(makeState(makeCall(.cleaning, far: "far")), .shutdown) {
            $0.shuttingDown = true
            $0.calls[callID]?.stage = .finalized
        }
    }
    @Test func cleaningCallIsFinalAsWritten_effect() {
        assert(makeState(makeCall(.cleaning, far: "far")), .shutdown, delivers: .stopCleaning([callID: final()]))
    }

    /// Diarizing and committing replace the file; the final form waits for that write.
    @Test(arguments: [State.Stage.diarizing, .committing])
    func fileReplacementHoldsSettling_state(stage: State.Stage) {
        assert(makeState(makeCall(stage, heard: "h")), .shutdown) { $0.shuttingDown = true }
    }
    @Test(arguments: [State.Stage.diarizing, .committing])
    func fileReplacementHoldsSettling_effect(stage: State.Stage) {
        assert(makeState(makeCall(stage, heard: "h")), .shutdown, delivers: nil)
    }

    @Test func diarizedAfterShutdownIsFinalWithoutCleaning_state() {
        assert(makeState(makeCall(.diarizing), shuttingDown: true), .diarized(call: callID, "far")) {
            $0.calls[callID]?.stage = .finalized
            $0.calls[callID]?.far = "far"
        }
    }
    @Test func diarizedAfterShutdownIsFinalWithoutCleaning_effect() {
        assert(makeState(makeCall(.diarizing), shuttingDown: true), .diarized(call: callID, "far"), delivers: published())
    }

    @Test func committedAfterShutdownIsFinal_state() {
        assert(makeState(makeCall(.committing, heard: "h"), shuttingDown: true), .committed(call: callID, succeeded: true)) {
            $0.calls[callID]?.stage = .finalized
        }
    }
    @Test func committedAfterShutdownIsFinal_effect() {
        assert(makeState(makeCall(.committing, heard: "h"), shuttingDown: true), .committed(call: callID, succeeded: true), delivers: published())
    }

    @Test func closedAfterShutdownIsFinalWithoutDiarizing_state() {
        assert(makeState(makeCall(), shuttingDown: true), .closed(call: callID, names: "names")) {
            $0.calls[callID]?.stage = .finalized
            $0.calls[callID]?.names = "names"
        }
    }
    @Test func closedAfterShutdownIsFinalWithoutDiarizing_effect() {
        assert(makeState(makeCall(), shuttingDown: true), .closed(call: callID, names: "names"), delivers: published())
    }

    /// A cleanup result that arrives after its call was settled is dropped.
    @Test func lateCleanupIsIgnored_state() {
        assert(makeState(makeCall(.finalized, published: true), shuttingDown: true, settled: true), .cleaned(call: callID, "heard"))
    }
    @Test func lateCleanupIsIgnored_effect() {
        assert(makeState(makeCall(.finalized, published: true), shuttingDown: true, settled: true), .cleaned(call: callID, "heard"), delivers: nil)
    }

    @Test func repeatedShutdownIsIgnored_state() {
        let state = State(calls: [callID: makeCall(.finalized, published: true)], shuttingDown: true, settled: true)
        assert(state, .shutdown)
    }
    @Test func repeatedShutdownIsIgnored_effect() {
        assert(State(calls: [callID: makeCall(.finalized, published: true)], shuttingDown: true, settled: true), .shutdown, delivers: nil)
    }

    @Test func shutdownSettlesEveryCleaningCallAtOnce() {
        let (sut, spy) = makeSUT(stub: ["e"])
        let state = State(calls: ["a": makeCall(.cleaning, raw: "ra"), "b": makeCall(.cleaning, raw: "rb", far: "fb"), "c": makeCall(.diarizing)])
        let effect = sut.reduce(state, .shutdown).1
        #expect(effect == .stopCleaning(["a": final(["e"]), "b": final(["e"])]))
        #expect(Set(spy.requests.map(\.raw)) == ["ra", "rb"])
        #expect(spy.requests.first { $0.raw == "rb" }?.far == "fb")
    }
}
