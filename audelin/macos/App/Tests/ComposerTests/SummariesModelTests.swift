import Calls
import CallsListUI
import CallsStorage
@testable import Composer
import Foundation
import Preferences
import SummaryFiles
import SummaryJobs
import NotesGeneration
import Observation
import Synchronization
import Testing

@MainActor @Suite struct SummariesModelTests {
    @Test(arguments: [false, true])
    func retryWithChangedTextWaitsForDiscardAndFreshAdmission(discardFails: Bool) async throws {
        let files = FilesFake(fails: discardFails)
        files.stored = try await record(phase: "failed")
        let transcript = Mutex<[Calls.Text.Line]>([])
        let preparation = SummariesPreparationPort(notes: { .init(enabled: true, speakers: false) }, makeID: { "new-job" },
                                                   callText: { _ in .init(transcript: transcript.withLock { $0 }) })
        let sut = SummariesModel(keeping: { true }, templates: TestDefaultTemplates(), text: { CallsListText(language: .english) },
                                 preparation: preparation, files: .init(files: files, makeID: { "retry-id" }), generation: GenerationStub())
        sut.recover(calls: ["call"])
        for await state in Observations({ sut.state }) where state.calls["call"]?.retryable == true { break }
        transcript.withLock { $0 = [.init(start: 3, words: "current transcript", label: "A")] }
        if discardFails {
            await #expect(throws: CocoaError.self) { try await sut.retry(call: "call") }
            #expect(sut.state.calls["call"]?.retryFailed == true && files.claimed.isEmpty)
        } else {
            try await sut.retry(call: "call")
            for await state in Observations({ sut.state }) where state.calls["call"]?.stage == .succeeded { break }
            #expect(files.claimed.map(\.job) == ["new-job"])
            #expect(files.claimed.first?.input == summaryInput([.init(label: "A", time: "3.0", text: "current transcript")]))
        }
        #expect(files.retried.isEmpty)
        #expect(files.writes.contains { if case .discard = $0 { true } else { false } })
        await sut.shutdown()
    }
    @Test func aSubmissionRunsThroughFilesAndGenerationToPublishedNotes() async throws {
        let files = FilesFake()
        let sut = makeSUT(files)
        sut.send(.finalized("call", entries: [.init(label: "A", time: "0", text: "spoken")], finalWrite: true, usable: true, notesOn: true, transcriptIdentity: "submitted-transcript"))
        try await waitUntil("notes are saved") { sut.state.calls["call"]?.stage == .succeeded }
        #expect(files.claimed.map(\.job) == ["job"])
        #expect(files.writes.contains { if case .publish(_, "notes", .default, .rotation, "submitted-transcript") = $0 { true } else { false } })
        #expect(sut.state.calls["call"]?.status == CallsListText(language: .english)(.summaryReady))
        #expect(sut.state.calls["call"]?.badge == SummariesState.Call.Badge.none)
    }
    @Test func makeSubmitsTheStoredTranscriptAsAsked() async throws {
        let files = FilesFake()
        let sut = makeSUT(files, notes: false, transcript: [.init(start: 3, words: "spoken", label: "A")])
        sut.make(call: "call")
        try await waitUntil("notes are saved") { sut.state.calls["call"]?.stage == .succeeded }
        let snapshot = try #require(files.claimed.first).snapshot
        #expect(String(decoding: snapshot, as: UTF8.self).contains(#"{"label":"A","text":"spoken","time":"3.0"}"#))
    }
    @Test func aFailedTranscriptReadFailsTheCallSoTheUserCanRetry() async throws {
        let files = FilesFake()
        let sut = makeSUT(files, readFails: true)
        sut.make(call: "call")
        try await waitUntil("the read fails") { sut.state.calls["call"]?.stage == .failed }
        #expect(sut.retryable == ["call"] && files.claimed.isEmpty)
    }
    @Test func retryRunsAFailedJobAgainUnderAFreshID() async throws {
        let files = FilesFake()
        files.stored = try await record(phase: "failed")
        let sut = makeSUT(files)
        sut.recover(calls: ["call"])
        try await waitUntil("the call is recovered") { sut.state.calls["call"]?.retryable == true }
        try await sut.retry(call: "call")
        try await waitUntil("the retry succeeds") { sut.state.calls["call"]?.stage == .succeeded }
        #expect(files.retried.map(\.1) == ["fresh"])
    }
    @Test func theCallsListReadsEachCallsStatusBadgeAndRetry() async throws {
        let files = FilesFake()
        files.stored = try await record(phase: "failed")
        let sut = makeSUT(files)
        sut.recover(calls: ["call"])
        try await waitUntil("the call is recovered") { sut.state.calls["call"]?.stage == .failed }
        #expect(sut.statuses == ["call": CallsListText(language: .english)(.summaryFailed)])
        #expect(sut.badges == ["call": .failed])
        #expect(sut.retryable == ["call"])
    }
    @Test func anEndedRecordingShowsWaitingUntilItsTranscriptArrives() async throws {
        let sut = makeSUT(FilesFake())
        sut.waiting(call: "call", notesOn: true)
        try await waitUntil("the call waits") { sut.statuses == ["call": CallsListText(language: .english)(.summaryWaiting)] }
        #expect(sut.badges == ["call": .pending])
        sut.send(.finalized("call", entries: [.init(label: "A", time: "0", text: "spoken")], finalWrite: true, usable: true, notesOn: true))
        try await waitUntil("notes are saved") { sut.state.calls["call"]?.stage == .succeeded }
    }
    @Test func forgetDropsASettledCall() async throws {
        let files = FilesFake()
        files.stored = try await record(phase: "succeeded")
        let sut = makeSUT(files)
        sut.recover(calls: ["call"])
        try await waitUntil("the call is recovered") { sut.state.calls["call"]?.stage == .succeeded }
        sut.forget(call: "call")
        try await waitUntil("the call is dropped") { sut.state.calls["call"] == nil }
    }
    @Test func aReplacementLoadsTheStagedJobUnderTheReusedIDAndDropsTheOtherPart() async throws {
        let files = FilesFake()
        files.stored = try await record(phase: "succeeded")
        let transcript = Calls.Text.Line(start: 3, words: "joined transcript", label: "Them (Ann)")
        let sut = makeSUT(files, transcript: [transcript])
        sut.recover(calls: ["call"])
        sut.waiting(call: "other", notesOn: true)
        for await state in Observations({ sut.state })
        where state.calls["call"]?.stage == .succeeded && state.calls["other"]?.stage == .waiting { break }

        let entries = storedSummaryEntries([transcript])
        let job = Job(id: "staged", call: "call", input: summaryInput(entries), entries: entries, speakers: true,
                      primary: .init(kind: "cli", model: "m", program: "p", endpoint: "", credentialVariable: ""),
                      speakersNamed: true)
        files.stored = try SummariesFilesPort.record(job, phase: "pending")
        sut.send(.replaced(removed: ["call", "other"], published: ["call"]))
        for await state in Observations({ sut.state })
        where state.calls["call"]?.job?.id == job.id && state.calls["call"]?.stage == .succeeded { break }

        #expect(sut.state.calls["other"] == nil)
        #expect(files.loaded == ["call", "call"] && files.claimed.isEmpty)
        #expect(files.writes.contains { if case .publish(let record, "notes", _, _, _) = $0 { record.job == job.id } else { false } })
        await sut.shutdown()
    }
    @Test func launchRecoversEachStoredCall() async throws {
        let files = FilesFake()
        files.stored = try await record(phase: "succeeded")
        let sut = makeSUT(files)
        sut.recover(calls: ["call"])
        try await waitUntil("the call is recovered") { sut.state.calls["call"]?.stage == .succeeded }
        #expect(files.loaded == ["call"])
    }
    @Test func refreshReadsAgainACallAnotherProcessRuns() async throws {
        let files = FilesFake()
        files.stored = try await record(phase: "running")
        let sut = makeSUT(files)
        sut.recover(calls: ["call"])
        try await waitUntil("the call is observed") { sut.state.calls["call"]?.stage == .observed }
        files.stored = try await record(phase: "succeeded")
        await sut.refresh()
        try await waitUntil("the call is reloaded") { sut.state.calls["call"]?.stage == .succeeded }
    }
    @Test func aWaitingCallIsDroppedWhenItsTranscriptArrivesWithNotesOff() async throws {
        let sut = makeSUT(FilesFake(), notes: false)
        sut.waiting(call: "call", notesOn: true)
        try await waitUntil("the call waits") { sut.state.calls["call"]?.stage == .waiting }
        sut.send(.finalized("call", entries: [.init(label: "A", time: "0", text: "spoken")], finalWrite: true, usable: true, notesOn: true))
        try await waitUntil("the call is dropped") { sut.state.calls["call"] == nil }
        #expect(sut.statuses.isEmpty)
    }
    @Test func aCallsStorageTransactionHoldsPublicationUntilItEnds() async throws {
        let files = FilesFake()
        let sut = makeSUT(files)
        let transactions = AsyncStream<CallsTransaction>.makeStream()
        let subscription = subscribeTransactions(transactions.stream, to: sut)
        defer { subscription.cancel() }
        transactions.continuation.yield(.running)
        try await waitUntil("the transaction is held") { sut.state.transaction }
        sut.send(.finalized("call", entries: [.init(label: "A", time: "0", text: "spoken")], finalWrite: true, usable: true, notesOn: true))
        try await waitUntil("the notes wait") { sut.state.calls["call"]?.stage == .deferred }
        #expect(!files.writes.contains { if case .publish = $0 { true } else { false } })
        transactions.continuation.yield(.idle)
        try await waitUntil("notes are saved") { sut.state.calls["call"]?.stage == .succeeded }
        #expect(files.writes.contains { if case .publish(_, "notes", .default, .rotation, nil) = $0 { true } else { false } })
    }
    @Test func shutdownReturnsOnceTheMachineHasSettled() async {
        let sut = makeSUT(FilesFake())
        await sut.shutdown()
        #expect(sut.state.lifecycle == .settled)
    }

    private func makeSUT(_ files: FilesFake, notes: Bool = true, transcript: [Calls.Text.Line] = [], readFails: Bool = false) -> SummariesModel {
        SummariesModel(keeping: { true }, templates: TestDefaultTemplates(), text: { CallsListText(language: .english) },
                       preparation: SummariesPreparationPort(notes: { .init(enabled: notes, speakers: false, primary: .init(kind: "cli", model: "m", executable: "/bin/p", endpoint: "", credentialVariable: "")) },
                                                             makeID: { "job" },
                                                             callText: { _ in if readFails { throw CocoaError(.fileReadNoSuchFile) }; return .init(transcript: transcript) }),
                       files: .init(files: files, makeID: { "fresh" }), generation: GenerationStub())
    }
    private func record(phase: String) async throws -> SummaryFiles.Record {
        let files = FilesFake()
        let job = Job(id: "job", call: "call", input: summaryInput([]), entries: [], speakers: false,
                      primary: .init(kind: "cli", model: "m", program: "p", endpoint: "", credentialVariable: ""))
        _ = try await SummariesFilesPort(files: files, makeID: { "fresh" }).claim(job)
        var value = try #require(files.claimed.first); value.phase = phase; return value
    }
}

private struct GenerationStub: SummariesGeneration {
    func identify(_ job: Job) async throws -> [Identity] { [] }
    func notes(_ job: Job, identities: [Identity], template: NotesGeneration.Template) async throws -> String { "notes" }
    func cancel(_ job: Job) async {}
}
