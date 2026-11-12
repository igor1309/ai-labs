import protocol BleedCleanup.MicrophoneCleaning
import protocol BleedCleanup.CleanedHearing
import CallText
import Foundation
import LiveText
import SummaryJobs
import Testing
@testable import Composer

/// Cleanup and its raw fallbacks hand the summary the far side as the closed file names it.
@Suite(.timeLimit(.minutes(1)))
struct AttributedCleanupTests {

    enum Scenario: CaseIterable { case cleaned, replacingFails, stoppedBefore, shutdownWhileHearing }

    @Test(arguments: Scenario.allCases)
    func everyPublicationKeepsTheNumberedSpeakers(scenario: Scenario) async throws {
        let raw = try await publishedCall(status: .finished, mine: [.init(text: line("shared words here", start: 1))],
                                          theirs: [.init(text: line("shared words here", start: 0))])
        let attributed = AttributedFar(
            far: [.init(side: .theirs, start: 0, settled: "shared words here", pending: "", speaker: "d0"),
                  .init(side: .theirs, start: 2, settled: "later words", pending: "", speaker: "d1")],
            speakers: [.init(id: "d0", name: nil, state: "diarized"), .init(id: "d1", name: nil, state: "diarized")])
        let heard = [line("my actual answer", start: 3)]
        let hearingStarted = AsyncStream<Void>.makeStream(), gate = AsyncStream<Void>.makeStream()
        defer { gate.continuation.finish(); hearingStarted.continuation.finish() }
        let cleanup = TranscriptCleanup(
            recording: .init(microphoneURL: URL(fileURLWithPath: "/mic"), callURL: URL(fileURLWithPath: "/call")),
            duration: { 60 }, cleaning: CleaningStub { _ in [0.25] },
            hearing: HearingStub { _ in
                if scenario == .shutdownWhileHearing {
                    hearingStarted.continuation.yield()
                    for await _ in gate.stream {}
                    throw CancellationError()
                }
                return heard
            }, sink: TestLogSink())
        let published = AsyncStream<[Job.Entry]>.makeStream()
        defer { published.continuation.finish() }
        let runs = CleanupRuns()
        if scenario == .stoppedBefore { await runs.shutdown() }
        let file = SummaryTranscript(base: AttributedFile(attributed: attributed, fails: scenario == .replacingFails),
                                     folder: URL(fileURLWithPath: "/synthetic"),
                                     callbacks: .init(waiting: { _ in }, completed: { _, entries, _, _ in published.continuation.yield(entries) }),
                                     cleanup: cleanup, runs: runs)
        try await file.write(raw)
        await file.close()
        if scenario == .shutdownWhileHearing {
            var started = hearingStarted.stream.makeAsyncIterator()
            await started.next()
            await runs.shutdown()
        }
        var results = published.stream.makeAsyncIterator()
        let entries = try #require(await results.next())
        #expect(entries == (scenario == .cleaned ? [
            .init(label: "Them 1", time: "0.0", text: "shared words here"),
            .init(label: "Them 2", time: "2.0", text: "later words"),
            .init(label: "Me", time: "3.0", text: "my actual answer"),
        ] : [
            .init(label: "Them 1", time: "0.0", text: "shared words here"),
            .init(label: "Me", time: "1.0", text: "shared words here"),
            .init(label: "Them 2", time: "2.0", text: "later words"),
        ]))
        await runs.shutdown()
    }
}

private actor AttributedFile: SessionTranscriptFile {
    let attributed: AttributedFar
    let fails: Bool
    init(attributed: AttributedFar, fails: Bool) { self.attributed = attributed; self.fails = fails }
    func write(_ state: CallState) {}
    func close() {}
    func attributeSpeakers() -> AttributedFar? { attributed }
    func replaceMicrophone(in state: CallState, with segments: [TranscriptSegment]) throws {
        if fails { throw ReplaceFailure() }
    }
}

private struct ReplaceFailure: Error {}

private func line(_ text: String, start: Double) -> TranscriptSegment {
    let words = text.split(separator: " ").enumerated().map {
        Word(String($0.element), start: start + Double($0.offset) * 0.1, end: start + Double($0.offset + 1) * 0.1)
    }
    return .init(id: Int(start), start: start, end: start + 1, words: words, settledCount: words.count)
}
