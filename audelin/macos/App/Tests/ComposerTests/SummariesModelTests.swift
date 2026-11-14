import Calls
import CallsListUI
import Composer
import Foundation
import Preferences
import SummaryFiles
import SummaryJobs
import Testing

@MainActor @Suite struct SummariesModelTests {
    @Test func aSubmissionRunsThroughFilesAndGenerationToPublishedNotes() async throws {
        let files = FilesFake()
        let sut = makeSUT(files)
        sut.completed(call: "call", entries: [.init(label: "A", time: "0", text: "spoken")], finalWrite: true, usable: true)
        try await waitUntil("notes are saved") { sut.state.calls["call"]?.stage == .succeeded }
        #expect(files.claimed.map(\.job) == ["job"])
        #expect(files.writes.contains { if case .publish(_, "notes") = $0 { true } else { false } })
        #expect(sut.state.calls["call"]?.status == CallsListText(language: .english)(.summaryReady))
        #expect(sut.state.calls["call"]?.badge == SummariesState.Call.Badge.none)
    }
    @Test func makeSubmitsTheStoredTranscriptAsAsked() async throws {
        let files = FilesFake()
        let sut = makeSUT(files, notes: false, transcript: [.init(start: 3, words: "spoken", label: "A")])
        try await sut.make(call: "call")
        try await waitUntil("notes are saved") { sut.state.calls["call"]?.stage == .succeeded }
        let snapshot = try #require(files.claimed.first).snapshot
        #expect(String(decoding: snapshot, as: UTF8.self).contains(#"{"label":"A","text":"spoken","time":"3.0"}"#))
    }
    @Test func aFailedTranscriptReadThrows() async {
        let sut = makeSUT(FilesFake(), readFails: true)
        await #expect(throws: (any Error).self) { try await sut.make(call: "call") }
        #expect(sut.state.calls.isEmpty)
    }
    @Test func retryRunsAFailedJobAgainUnderAFreshID() async throws {
        let files = FilesFake()
        files.stored = try await record(phase: "failed")
        let sut = makeSUT(files)
        sut.recover(calls: ["call"])
        try await waitUntil("the call is recovered") { sut.state.calls["call"]?.retryable == true }
        sut.retry(call: "call")
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
        sut.waiting(call: "call")
        try await waitUntil("the call waits") { sut.statuses == ["call": CallsListText(language: .english)(.summaryWaiting)] }
        #expect(sut.badges == ["call": .pending])
        sut.completed(call: "call", entries: [.init(label: "A", time: "0", text: "spoken")], finalWrite: true, usable: true)
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
        sut.refresh()
        try await waitUntil("the call is reloaded") { sut.state.calls["call"]?.stage == .succeeded }
    }
    @Test func shutdownReturnsOnceTheMachineHasEnded() async {
        let sut = makeSUT(FilesFake())
        await sut.shutdown()
        #expect(sut.state.lifecycle == .ended)
    }

    private func makeSUT(_ files: FilesFake, notes: Bool = true, transcript: [Calls.Text.Line] = [], readFails: Bool = false) -> SummariesModel {
        SummariesModel(text: { CallsListText(language: .english) },
                       callText: { _ in if readFails { throw CocoaError(.fileReadNoSuchFile) }; return .init(notes: nil, transcript: transcript) },
                       preparation: SummariesPreparationPort(notes: { .init(enabled: notes, speakers: false, primary: .init(kind: "cli", model: "m", executable: "/bin/p", endpoint: "", credentialVariable: "")) },
                                                             makeID: { "job" }),
                       files: .init(files: files, makeID: { "fresh" }), generation: GenerationStub())
    }
    private func record(phase: String) async throws -> SummaryFiles.Record {
        let files = FilesFake()
        let job = Job(id: "job", call: "call", input: "input", entries: [], speakers: false,
                      primary: .init(kind: "cli", model: "m", program: "p", endpoint: "", credentialVariable: ""))
        _ = try await SummariesFilesPort(files: files, makeID: { "fresh" }).claim(job)
        var value = try #require(files.claimed.first); value.phase = phase; return value
    }
}

private struct GenerationStub: SummariesGeneration {
    func identify(_ job: Job) async throws -> [Identity] { [] }
    func notes(_ job: Job, identities: [Identity]) async throws -> String { "notes" }
}
