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
        sut.send(.submit(.init(call: "call", input: "input", entries: [.init(label: "A", time: "0", text: "spoken")], finalWrite: true, usable: true)))
        try await waitUntil("notes are saved") { sut.state.calls["call"]?.stage == .succeeded }
        #expect(files.claimed.map(\.job) == ["job"])
        #expect(files.writes.contains { if case .publish(_, "notes") = $0 { true } else { false } })
        #expect(sut.state.calls["call"]?.status == CallsListText(language: .english)(.summaryReady))
        #expect(sut.state.calls["call"]?.badge == SummariesState.Call.Badge.none)
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

    private func makeSUT(_ files: FilesFake) -> SummariesModel {
        SummariesModel(text: { CallsListText(language: .english) },
                       preparation: SummariesPreparationPort(notes: { .init(enabled: true, speakers: false, primary: .init(kind: "cli", model: "m", executable: "/bin/p", endpoint: "", credentialVariable: "")) },
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
