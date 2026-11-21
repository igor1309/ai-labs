import Testing
import TranscriptFinalization

struct TranscriptFinalizationReducerTests {

    @Test func openingStartsTheCall_state() { assert(makeState(), .opened(call: callID)) { $0.calls[callID] = .init() } }
    @Test func openingStartsTheCall_effect() { assert(makeState(), .opened(call: callID), delivers: nil) }

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

    @Test func closingASavedCallWaitsForEvidence_state() { assert(makeState(makeCall()), .closed(call: callID, names: "names")) {
        $0.calls[callID]?.stage = .waitingForEvidence
        $0.calls[callID]?.names = "names"
    } }
    @Test func closingASavedCallWaitsForEvidence_effect() {
        assert(makeState(makeCall()), .closed(call: callID, names: "names"), delivers: nil)
    }

    @Test func closingAfterAFailedWriteIsFinalAsSaved_state() {
        assert(makeState(makeCall(saved: false)), .closed(call: callID, names: "names")) {
            $0.calls[callID]?.stage = .failed
            $0.calls[callID]?.names = "names"
        }
    }
    @Test func closingAfterAFailedWriteIsFinalAsSaved_effect() {
        assert(makeState(makeCall(saved: false)), .closed(call: callID, names: "names"), delivers: published(finalWrite: false))
    }

    @Test func closingWithoutAWriteIsFinalAndEmpty_state() {
        assert(makeState(), .closed(call: callID, names: "names")) { $0.calls[callID] = makeCall(.failed, saved: false, raw: nil, names: "names") }
    }
    @Test func closingWithoutAWriteIsFinalAndEmpty_effect() {
        assert(makeState(), .closed(call: callID, names: "names"), delivers: published([], finalWrite: false))
    }

    @Test func diarizedFarSideIsCleaned_state() {
        assert(makeState(makeCall(.diarizing)), .diarized(call: callID, .init(far: "far", diarizer: "nemotron"))) {
            $0.calls[callID]?.stage = .cleaning
            $0.calls[callID]?.far = "far"
            $0.calls[callID]?.outcomes.split = .done(diarizer: "nemotron")
        }
    }
    @Test func diarizedFarSideIsCleaned_effect() {
        assert(makeState(makeCall(.diarizing)), .diarized(call: callID, .init(far: "far", diarizer: "nemotron")), delivers: .clean(call: callID, "raw", "far"))
    }

    @Test func failedDiarizationCleansTheWrittenText_state() {
        assert(makeState(makeCall(.diarizing)), .diarized(call: callID, nil)) { $0.calls[callID]?.stage = .cleaning; $0.calls[callID]?.outcomes.split = .nothingKept }
    }
    @Test func failedDiarizationCleansTheWrittenText_effect() {
        assert(makeState(makeCall(.diarizing)), .diarized(call: callID, nil), delivers: .clean(call: callID, "raw", nil))
    }

    @Test func heardMicrophoneIsCommitted_state() {
        assert(makeState(makeCall(.cleaning, names: "names", far: "far")), .cleaned(call: callID, "heard")) {
            $0.calls[callID]?.stage = .committing
            $0.calls[callID]?.heard = "heard"
            $0.calls[callID]?.outcomes.cleaning = .done
        }
    }
    @Test func heardMicrophoneIsCommitted_effect() {
        assert(makeState(makeCall(.cleaning, names: "names", far: "far")), .cleaned(call: callID, "heard"),
               delivers: .commit(call: callID, "raw", "names", "far", "heard", .init(cleaning: .done)))
    }

    @Test func keptMicrophoneIsFinal_state() {
        assert(makeState(makeCall(.cleaning, far: "far")), .cleaned(call: callID, nil)) { $0.calls[callID]?.stage = .committing; $0.calls[callID]?.outcomes.cleaning = .nothingKept }
    }
    @Test func keptMicrophoneIsFinal_effect() {
        assert(makeState(makeCall(.cleaning, far: "far")), .cleaned(call: callID, nil), delivers: .commit(call: callID, "raw", nil, "far", nil, .init(cleaning: .nothingKept)))
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
        let state = State(calls: ["other": makeCall(.waitingForEvidence), callID: makeCall(.waitingForEvidence, names: "names")])
        assert(state, .evidenceClosed(call: callID, "closed evidence")) {
            $0.calls[callID]?.stage = .diarizing
        }
    }
    @Test func callsAreIndependent_effect() {
        let state = State(calls: ["other": makeCall(.waitingForEvidence), callID: makeCall(.waitingForEvidence, names: "names")])
        assert(state, .evidenceClosed(call: callID, "closed evidence"), delivers: .diarize(call: callID, "raw", "closed evidence", .init()))
    }

    /// Each stage takes only its own result; a final call takes nothing.
    @Test func outOfStageEventsAreIgnored_state() { for (state, event) in outOfStage { assert(state, event) } }
    @Test func outOfStageEventsAreIgnored_effect() { for (state, event) in outOfStage { assert(state, event, delivers: nil) } }
}

struct TranscriptFinalizationEntriesTests {

    @Test func noEntriesAreMadeBeforeTheFinalForm() {
        let (sut, spy) = makeSUT()
        for (state, event) in [(makeState(), Event.inputEnded), (makeState(), .shutdown),
                               (makeState(shuttingDown: true), .opened(call: callID)),
                               (makeState(shuttingDown: true), .wrote(call: callID, "saved")),
                               (makeState(), Event.wrote(call: callID, "a")), (makeState(makeCall()), .closed(call: callID, names: "names")),
                               (makeState(makeCall(.waitingForEvidence)), .evidenceClosed(call: callID, "closed evidence")),
                               (makeState(makeCall(.diarizing)), .diarized(call: callID, .init(far: "far", diarizer: "nemotron"))),
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
        let effect = sut.reduce(makeState(makeCall(.committing, far: "far", outcomes: .init(cleaning: .nothingKept))), .committed(call: callID, succeeded: true)).1
        #expect(spy.requests == [.init(raw: "raw", far: "far", heard: nil)])
        #expect(effect == published(["kept"]))
    }

    @Test func failedWriteEntriesAreTheLastSavedText() {
        let (sut, spy) = makeSUT(stub: ["saved"])
        let effect = sut.reduce(makeState(makeCall(saved: false)), .closed(call: callID, names: "names")).1
        #expect(spy.requests == [.init(raw: "raw", far: nil, heard: nil)])
        #expect(effect == published(["saved"], finalWrite: false))
    }

    /// Without any saved text there is nothing to map.
    @Test func noSavedTextMakesNoEntries() {
        let (sut, spy) = makeSUT()
        _ = sut.reduce(makeState(), .closed(call: callID, names: "names"))
        #expect(spy.requests.isEmpty)
    }

    @Test func emptyEntriesAreNotUsable() {
        let (sut, _) = makeSUT(stub: [])
        #expect(sut.reduce(makeState(makeCall(.committing)), .committed(call: callID, succeeded: true)).1 == published([]))
    }
}

let outOfStage: [(State, Event)] = {
    let all: [Event] = [
        .wrote(call: callID, "x"), .writeFailed(call: callID), .closed(call: callID, names: "names"), .diarized(call: callID, .init(far: "f", diarizer: "nemotron")),
        .cleaned(call: callID, "h"), .committed(call: callID, succeeded: true), .published(calls: [callID]), .opened(call: callID),
        .evidenceClosed(call: callID, "closed evidence"),
    ]
    let accepted: [State.Stage: Set<Int>] = [.writing: [0, 1, 2], .waitingForEvidence: [8], .diarizing: [3],
                                            .cleaning: [4], .committing: [5], .finalized: [6], .failed: [6]]
    let stages: [State.Stage] = [.writing, .waitingForEvidence, .diarizing, .cleaning, .committing, .finalized, .failed]
    return stages.flatMap { stage in
        all.indices.filter { !accepted[stage]!.contains($0) }.map { (makeState(makeCall(stage, heard: stage == .committing ? "h" : nil)), all[$0]) }
    } + [3, 4, 5, 6, 8].map { (makeState(), all[$0]) }
}()
