import Testing
import TranscriptFinalization

struct TranscriptFinalizationReducerTests {

    @Test func firstWriteStartsTheCall_state() {
        assert(makeState(), .wrote(call: callID, entries: ["a"], usable: true)) { $0.calls[callID] = makeCall(entries: ["a"]) }
    }
    @Test func firstWriteStartsTheCall_effect() { assert(makeState(), .wrote(call: callID, entries: ["a"], usable: true), delivers: nil) }

    @Test func writeReplacesEntries_state() {
        assert(makeState(makeCall(saved: false)), .wrote(call: callID, entries: ["b"], usable: false)) {
            $0.calls[callID] = makeCall(entries: ["b"], usable: false)
        }
    }
    @Test func writeReplacesEntries_effect() {
        assert(makeState(makeCall(saved: false)), .wrote(call: callID, entries: ["b"], usable: false), delivers: nil)
    }

    /// A failed write keeps the last saved entries but bars the final write.
    @Test func writeFailureMarksLatestWrite_state() {
        assert(makeState(makeCall()), .writeFailed(call: callID)) { $0.calls[callID]?.latestWriteSucceeded = false }
    }
    @Test func writeFailureMarksLatestWrite_effect() { assert(makeState(makeCall()), .writeFailed(call: callID), delivers: nil) }

    @Test func closingASavedCallDiarizes_state() {
        assert(makeState(makeCall()), .closed(call: callID)) { $0.calls[callID]?.stage = .diarizing }
    }
    @Test func closingASavedCallDiarizes_effect() {
        assert(makeState(makeCall()), .closed(call: callID), delivers: .diarize(call: callID))
    }

    @Test func closingAfterAFailedWritePublishesAsSaved_state() {
        assert(makeState(makeCall(saved: false)), .closed(call: callID)) { $0.calls[callID]?.stage = .failed }
    }
    @Test func closingAfterAFailedWritePublishesAsSaved_effect() {
        assert(makeState(makeCall(saved: false)), .closed(call: callID),
               delivers: .publish(call: callID, .init(entries: ["hello"], usable: true, finalWrite: false)))
    }

    @Test func closingWithoutAWritePublishesEmpty_state() {
        assert(makeState(), .closed(call: callID)) { $0.calls[callID] = makeCall(.failed, saved: false, entries: [], usable: false) }
    }
    @Test func closingWithoutAWritePublishesEmpty_effect() {
        assert(makeState(), .closed(call: callID), delivers: .publish(call: callID, .init(entries: [], usable: false, finalWrite: false)))
    }

    @Test func diarizedEntriesArePublished_state() {
        assert(makeState(makeCall(.diarizing)), .diarized(call: callID, entries: ["Them 1"])) {
            $0.calls[callID]?.stage = .finalized
            $0.calls[callID]?.entries = ["Them 1"]
        }
    }
    @Test func diarizedEntriesArePublished_effect() {
        assert(makeState(makeCall(.diarizing)), .diarized(call: callID, entries: ["Them 1"]),
               delivers: .publish(call: callID, .init(entries: ["Them 1"], usable: true, finalWrite: true)))
    }

    @Test func failedDiarizationPublishesWrittenEntries_state() {
        assert(makeState(makeCall(.diarizing)), .diarized(call: callID, entries: nil)) { $0.calls[callID]?.stage = .finalized }
    }
    @Test func failedDiarizationPublishesWrittenEntries_effect() {
        assert(makeState(makeCall(.diarizing)), .diarized(call: callID, entries: nil),
               delivers: .publish(call: callID, .init(entries: ["hello"], usable: true, finalWrite: true)))
    }

    /// Other calls are untouched by one call's events.
    @Test func callsAreIndependent_state() {
        let other = State(calls: ["other": makeCall(.diarizing), callID: makeCall()])
        assert(other, .closed(call: callID)) { $0.calls[callID]?.stage = .diarizing }
    }
    @Test func callsAreIndependent_effect() {
        let other = State(calls: ["other": makeCall(.diarizing), callID: makeCall()])
        assert(other, .closed(call: callID), delivers: .diarize(call: callID))
    }

    /// After close, only the diarization result counts; after the final form, nothing does.
    @Test func lateEventsAreIgnored_state() {
        for (state, event) in ignored { assert(state, event) }
    }
    @Test func lateEventsAreIgnored_effect() {
        for (state, event) in ignored { assert(state, event, delivers: nil) }
    }
}

private let ignored: [(State, Event)] = {
    let writeEvents: [Event] = [.wrote(call: callID, entries: ["x"], usable: true), .writeFailed(call: callID), .closed(call: callID)]
    let done: [State.Stage] = [.finalized, .failed]
    return writeEvents.map { (makeState(makeCall(.diarizing)), $0) }
        + done.flatMap { stage in (writeEvents + [.diarized(call: callID, entries: ["y"])]).map { (makeState(makeCall(stage)), $0) } }
        + [(makeState(makeCall()), .diarized(call: callID, entries: ["y"])), (makeState(), .diarized(call: callID, entries: ["y"]))]
}()
