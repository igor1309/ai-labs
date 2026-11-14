import SummaryJobs
import Testing

@Suite struct HandoffTests {
    @Test func latestWriteAndCloseDecideEligibility() {
        let entries = job().entries
        var state = Handoff.reduce(.init(), .wrote(entries, usable: true)).0
        state = Handoff.reduce(state, .writeFailed).0
        #expect(Handoff.reduce(state, .closed).1 == .offer(entries, finalWrite: false, usable: true))
        state = Handoff.reduce(state, .wrote(entries, usable: true)).0
        let (closed, effect) = Handoff.reduce(state, .closed)
        #expect(effect == .diarize)
        #expect(Handoff.reduce(closed, .diarized(nil)).1 == .offer(entries, finalWrite: true, usable: true))
        #expect(Handoff.reduce(closed, .closed).1 == nil)
        #expect(Handoff.reduce(.init(), .closed).1 == .offer([], finalWrite: false, usable: false))
    }
    @Test func aSavedTranscriptIsDiarizedBeforeItIsOffered() {
        let entries = job().entries
        let saved = Handoff(latestWriteSucceeded: true, entries: entries, usable: true)
        let (diarizing, effect) = Handoff.reduce(saved, .closed)
        #expect(diarizing == Handoff(latestWriteSucceeded: true, closed: true, entries: entries, usable: true, diarizing: true))
        #expect(effect == .diarize)
        let labelled = [Job.Entry(label: "Them 1", time: "0.0", text: "hello")]
        let (offered, offer) = Handoff.reduce(diarizing, .diarized(labelled))
        #expect(offered == Handoff(latestWriteSucceeded: true, closed: true, offered: true, entries: labelled, usable: true))
        #expect(offer == .offer(labelled, finalWrite: true, usable: true))
    }
    @Test func aFailedDiarizationOffersTheEntriesAsWritten() {
        let entries = job().entries
        let diarizing = Handoff(latestWriteSucceeded: true, closed: true, entries: entries, usable: true, diarizing: true)
        let (offered, offer) = Handoff.reduce(diarizing, .diarized(nil))
        #expect(offered == Handoff(latestWriteSucceeded: true, closed: true, offered: true, entries: entries, usable: true))
        #expect(offer == .offer(entries, finalWrite: true, usable: true))
    }
    @Test(arguments: [Handoff.Event.wrote([], usable: false), .writeFailed, .closed])
    func whileDiarizingOnlyItsResultCounts(event: Handoff.Event) {
        let diarizing = Handoff(latestWriteSucceeded: true, closed: true, entries: job().entries, usable: true, diarizing: true)
        #expect(Handoff.reduce(diarizing, event) == (diarizing, nil))
    }
    @Test func aDiarizedResultWithoutAPassIsIgnored() {
        let state = Handoff(latestWriteSucceeded: true, entries: job().entries, usable: true)
        #expect(Handoff.reduce(state, .diarized([])) == (state, nil))
    }
}
private func job() -> Job {
    let runtime = Job.Runtime(kind: "compatibleAPI", model: "fixture", program: "", endpoint: "http://127.0.0.1", credentialVariable: "")
    return .init(id: "job", call: "call", input: "input", entries: [.init(label: "A", time: "0", text: "Hello")], speakers: true, primary: runtime, fallback: runtime)
}
