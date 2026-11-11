import LiveText
import CallText
import Foundation
import SummaryJobs
import Testing
@testable import Composer

@Suite(.timeLimit(.minutes(1)))
struct SummaryTranscriptBoundaryTests {
    @Test(arguments: 0...4)
    func disabledTextKeepsSettledAndPendingWordBoundariesAtHandoff(settledCount: Int) async throws {
        let state = try await publishedCall(status: .off, mine: [
            .init(text: .init(id: 1, start: 0, end: 1, words: [
                .init("My", start: 0, end: 0.2), .init("name", start: 0.25, end: 0.4),
                .init("is", start: 0.5, end: 0.6), .init("Alice.", start: 0.75, end: 1),
            ], settledCount: settledCount))
        ], theirs: [])
        let captured = AsyncStream<[Job.Entry]>.makeStream()
        defer { captured.continuation.finish() }
        let runs = CleanupRuns()
        let cleanup = TranscriptCleanup(
            recording: .init(microphoneURL: URL(fileURLWithPath: "/mic"), callURL: URL(fileURLWithPath: "/call")),
            duration: { 60 }, cleaning: CleaningStub { _ in Issue.record("Unexpected cleaning"); return [] },
            hearing: HearingStub { _ in Issue.record("Unexpected hearing"); return nil }, sink: TestLogSink())
        let file = SummaryTranscript(base: BoundaryTranscript(), folder: URL(fileURLWithPath: "/synthetic"), callbacks: .init(waiting: { _ in }, completed: { _, entries, final, usable in
            #expect(final && usable)
            captured.continuation.yield(entries)
        }), cleanup: cleanup, runs: runs)
        try await file.write(state)
        await file.close()
        var results = captured.stream.makeAsyncIterator()
        #expect(await results.next()?.map(\.text) == ["My name is Alice."])
        await runs.shutdown()
    }
}
@Suite(.timeLimit(.minutes(1)))
struct SummaryTranscriptDiarizingTests {
    @Test(arguments: [true, false])
    func theSummaryWaitsForTheClosedFilesSpeakers(found: Bool) async throws {
        let state = try await publishedCall(status: .off, mine: [], theirs: [
            .init(text: .init(id: 1, start: 0, end: 1, words: [.init("hi", start: 0, end: 1)], settledCount: 1)),
        ])
        let far = AttributedFar(far: [.init(side: .theirs, start: 0, settled: "hi", pending: "", speaker: "d0"),
                                      .init(side: .theirs, start: 0.5, settled: "there", pending: "", speaker: "d1")],
                                speakers: [.init(id: "d0", name: nil, state: "diarized"), .init(id: "d1", name: nil, state: "diarized")])
        let captured = AsyncStream<[Job.Entry]>.makeStream()
        defer { captured.continuation.finish() }
        let runs = CleanupRuns()
        let cleanup = TranscriptCleanup(
            recording: .init(microphoneURL: URL(fileURLWithPath: "/mic"), callURL: URL(fileURLWithPath: "/call")),
            duration: { 60 }, cleaning: CleaningStub { _ in Issue.record("Unexpected cleaning"); return [] },
            hearing: HearingStub { _ in Issue.record("Unexpected hearing"); return nil }, sink: TestLogSink())
        let base = BoundaryTranscript(attributed: found ? far : nil)
        let file = SummaryTranscript(base: base, folder: URL(fileURLWithPath: "/synthetic"), callbacks: .init(waiting: { _ in }, completed: { _, entries, _, _ in
            captured.continuation.yield(entries)
        }), cleanup: cleanup, runs: runs)
        try await file.write(state)
        await file.close()
        var results = captured.stream.makeAsyncIterator()
        #expect(await results.next()?.map(\.label) == (found ? ["Them 1", "Them 2"] : ["Them"]))
        #expect(await base.calls == ["close", "attributeSpeakers"])
        await runs.shutdown()
    }
}
private actor BoundaryTranscript: SessionTranscriptFile {
    let attributed: AttributedFar?
    private(set) var calls: [String] = []
    init(attributed: AttributedFar? = nil) { self.attributed = attributed }
    func write(_ text: CallState) {}
    func close() { calls.append("close") }
    func attributeSpeakers() -> AttributedFar? { calls.append("attributeSpeakers"); return attributed }
    func replaceMicrophone(in state: CallState, with segments: [TranscriptSegment]) {
        Issue.record("Unexpected microphone replacement")
    }
}
