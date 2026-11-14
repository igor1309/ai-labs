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
        let sut = SummariesModel(text: { CallsListText(language: .english) },
                                 preparation: SummariesPreparationPort(notes: { .init(enabled: true, speakers: false, primary: .init(kind: "cli", model: "m", executable: "/bin/p", endpoint: "", credentialVariable: "")) },
                                                                       makeID: { "job" }),
                                 files: .init(files: files, makeID: { "fresh" }), generation: GenerationStub())
        sut.send(.submit(.init(call: "call", input: "input", entries: [.init(label: "A", time: "0", text: "spoken")], finalWrite: true, usable: true)))
        try await waitUntil("notes are saved") { sut.state.calls["call"]?.stage == .succeeded }
        #expect(files.claimed.map(\.job) == ["job"])
        #expect(files.writes.contains { if case .publish(_, "notes") = $0 { true } else { false } })
        #expect(sut.state.calls["call"]?.status == CallsListText(language: .english)(.summaryReady))
        #expect(sut.state.calls["call"]?.badge == SummariesState.Call.Badge.none)
    }
}

private struct GenerationStub: SummariesGeneration {
    func identify(_ job: Job) async throws -> [Identity] { [] }
    func notes(_ job: Job, identities: [Identity]) async throws -> String { "notes" }
}
