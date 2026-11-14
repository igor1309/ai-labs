import Testing
import TranscriptFinalization

struct TranscriptFinalizationReducerTests {

    @Test func firstWriteStartsTheCall_state() { assert(makeState(), .wrote(call: callID, "a")) { $0.calls[callID] = makeCall(raw: "a") } }
    @Test func firstWriteStartsTheCall_effect() { assert(makeState(), .wrote(call: callID, "a"), delivers: nil) }

    @Test func writeReplacesTheText_state() {
        assert(makeState(makeCall(saved: false)), .wrote(call: callID, "b")) { $0.calls[callID] = makeCall(raw: "b") }
    }
    @Test func writeReplacesTheText_effect() { assert(makeState(makeCall(saved: false)), .wrote(call: callID, "b"), delivers: nil) }

    /// A failed write keeps the last saved text but bars the final write.
    @Test func writeFailureMarksLatestWrite_state() {
        assert(makeState(makeCall()), .writeFailed(call: callID)) { $0.calls[callID]?.latestWriteSucceeded = false }
    }
    @Test func writeFailureMarksLatestWrite_effect() { assert(makeState(makeCall()), .writeFailed(call: callID), delivers: nil) }

    @Test func closingASavedCallDiarizes_state() { assert(makeState(makeCall()), .closed(call: callID)) { $0.calls[callID]?.stage = .diarizing } }
    @Test func closingASavedCallDiarizes_effect() { assert(makeState(makeCall()), .closed(call: callID), delivers: .diarize(call: callID, "raw")) }

    @Test func closingAfterAFailedWriteIsFinalAsSaved_state() {
        assert(makeState(makeCall(saved: false)), .closed(call: callID)) { $0.calls[callID]?.stage = .failed }
    }
    @Test func closingAfterAFailedWriteIsFinalAsSaved_effect() {
        assert(makeState(makeCall(saved: false)), .closed(call: callID), delivers: published(finalWrite: false))
    }

    @Test func closingWithoutAWriteIsFinalAndEmpty_state() {
        assert(makeState(), .closed(call: callID)) { $0.calls[callID] = makeCall(.failed, saved: false, raw: nil) }
    }
    @Test func closingWithoutAWriteIsFinalAndEmpty_effect() {
        assert(makeState(), .closed(call: callID), delivers: published([], finalWrite: false))
    }

    @Test func diarizedFarSideIsCleaned_state() {
        assert(makeState(makeCall(.diarizing)), .diarized(call: callID, "far")) {
            $0.calls[callID]?.stage = .cleaning
            $0.calls[callID]?.far = "far"
        }
    }
    @Test func diarizedFarSideIsCleaned_effect() {
        assert(makeState(makeCall(.diarizing)), .diarized(call: callID, "far"), delivers: .clean(call: callID, "raw", "far"))
    }

    @Test func failedDiarizationCleansTheWrittenText_state() {
        assert(makeState(makeCall(.diarizing)), .diarized(call: callID, nil)) { $0.calls[callID]?.stage = .cleaning }
    }
    @Test func failedDiarizationCleansTheWrittenText_effect() {
        assert(makeState(makeCall(.diarizing)), .diarized(call: callID, nil), delivers: .clean(call: callID, "raw", nil))
    }

    @Test func heardMicrophoneIsCommitted_state() {
        assert(makeState(makeCall(.cleaning, far: "far")), .cleaned(call: callID, "heard")) {
            $0.calls[callID]?.stage = .committing
            $0.calls[callID]?.heard = "heard"
        }
    }
    @Test func heardMicrophoneIsCommitted_effect() {
        assert(makeState(makeCall(.cleaning, far: "far")), .cleaned(call: callID, "heard"), delivers: .commit(call: callID, "raw", "far", "heard"))
    }

    @Test func keptMicrophoneIsFinal_state() {
        assert(makeState(makeCall(.cleaning, far: "far")), .cleaned(call: callID, nil)) { $0.calls[callID]?.stage = .finalized }
    }
    @Test func keptMicrophoneIsFinal_effect() {
        assert(makeState(makeCall(.cleaning, far: "far")), .cleaned(call: callID, nil), delivers: published())
    }

    @Test func committedCleanupIsFinal_state() {
        assert(makeState(makeCall(.committing, heard: "heard")), .committed(call: callID, succeeded: true)) { $0.calls[callID]?.stage = .finalized }
    }
    @Test func committedCleanupIsFinal_effect() {
        assert(makeState(makeCall(.committing, heard: "heard")), .committed(call: callID, succeeded: true), delivers: published())
    }

    /// The file keeps its previous bytes, so the final form is the text as written.
    @Test func failedCommitIsFinalAsWritten_state() {
        assert(makeState(makeCall(.committing, heard: "heard")), .committed(call: callID, succeeded: false)) {
            $0.calls[callID]?.stage = .finalized
            $0.calls[callID]?.heard = nil
        }
    }
    @Test func failedCommitIsFinalAsWritten_effect() {
        assert(makeState(makeCall(.committing, heard: "heard")), .committed(call: callID, succeeded: false), delivers: published())
    }

    @Test func callsAreIndependent_state() {
        let state = State(calls: ["other": makeCall(.diarizing), callID: makeCall()])
        assert(state, .closed(call: callID)) { $0.calls[callID]?.stage = .diarizing }
    }
    @Test func callsAreIndependent_effect() {
        let state = State(calls: ["other": makeCall(.diarizing), callID: makeCall()])
        assert(state, .closed(call: callID), delivers: .diarize(call: callID, "raw"))
    }

    /// Each stage takes only its own result; a final call takes nothing.
    @Test func outOfStageEventsAreIgnored_state() { for (state, event) in outOfStage { assert(state, event) } }
    @Test func outOfStageEventsAreIgnored_effect() { for (state, event) in outOfStage { assert(state, event, delivers: nil) } }
}

struct TranscriptFinalizationEntriesTests {

    @Test func noEntriesAreMadeBeforeTheFinalForm() {
        let (sut, spy) = makeSUT()
        for (state, event) in [(makeState(), Event.wrote(call: callID, "a")), (makeState(makeCall()), .closed(call: callID)),
                               (makeState(makeCall(.diarizing)), .diarized(call: callID, "far")),
                               (makeState(makeCall(.cleaning)), .cleaned(call: callID, "heard"))] + outOfStage {
            _ = sut.reduce(state, event)
        }
        #expect(spy.requests.isEmpty)
    }

    @Test func committedEntriesTakeTheHeardSide() {
        let (sut, spy) = makeSUT(stub: ["clean"])
        let effect = sut.reduce(makeState(makeCall(.committing, far: "far", heard: "heard")), .committed(call: callID, succeeded: true)).1
        #expect(spy.requests == [.init(raw: "raw", far: "far", heard: "heard")])
        #expect(effect == published(["clean"]))
    }

    @Test func failedCommitEntriesKeepTheWrittenSide() {
        let (sut, spy) = makeSUT(stub: ["raw"])
        let effect = sut.reduce(makeState(makeCall(.committing, far: "far", heard: "heard")), .committed(call: callID, succeeded: false)).1
        #expect(spy.requests == [.init(raw: "raw", far: "far", heard: nil)])
        #expect(effect == published(["raw"]))
    }

    @Test func keptMicrophoneEntriesTakeTheFarSide() {
        let (sut, spy) = makeSUT(stub: ["kept"])
        let effect = sut.reduce(makeState(makeCall(.cleaning, far: "far")), .cleaned(call: callID, nil)).1
        #expect(spy.requests == [.init(raw: "raw", far: "far", heard: nil)])
        #expect(effect == published(["kept"]))
    }

    @Test func failedWriteEntriesAreTheLastSavedText() {
        let (sut, spy) = makeSUT(stub: ["saved"])
        let effect = sut.reduce(makeState(makeCall(saved: false)), .closed(call: callID)).1
        #expect(spy.requests == [.init(raw: "raw", far: nil, heard: nil)])
        #expect(effect == published(["saved"], finalWrite: false))
    }

    /// Without any saved text there is nothing to map.
    @Test func noSavedTextMakesNoEntries() {
        let (sut, spy) = makeSUT()
        _ = sut.reduce(makeState(), .closed(call: callID))
        #expect(spy.requests.isEmpty)
    }

    @Test func emptyEntriesAreNotUsable() {
        let (sut, _) = makeSUT(stub: [])
        #expect(sut.reduce(makeState(makeCall(.cleaning)), .cleaned(call: callID, nil)).1 == published([]))
    }
}

let outOfStage: [(State, Event)] = {
    let all: [Event] = [
        .wrote(call: callID, "x"), .writeFailed(call: callID), .closed(call: callID), .diarized(call: callID, "f"),
        .cleaned(call: callID, "h"), .committed(call: callID, succeeded: true),
    ]
    let accepted: [State.Stage: Set<Int>] = [.writing: [0, 1, 2], .diarizing: [3], .cleaning: [4], .committing: [5], .finalized: [], .failed: []]
    let stages: [State.Stage] = [.writing, .diarizing, .cleaning, .committing, .finalized, .failed]
    return stages.flatMap { stage in
        all.indices.filter { !accepted[stage]!.contains($0) }.map { (makeState(makeCall(stage, heard: stage == .committing ? "h" : nil)), all[$0]) }
    } + all.indices.filter { $0 >= 3 }.map { (makeState(), all[$0]) }
}()
