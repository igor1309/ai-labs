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
        let cleanup = TranscriptCleanup(timeline: CaptureTimeline(),
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
private actor BoundaryTranscript: SessionTranscriptFile {
    func write(_ text: CallState) {}
    func close() {}
    func replaceMicrophone(in state: CallState, with segments: [TranscriptSegment], at destination: URL?) {
        Issue.record("Unexpected microphone replacement")
    }
}
