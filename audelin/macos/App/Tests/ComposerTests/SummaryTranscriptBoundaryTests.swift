import LiveText
import CallText
import Foundation
import SummaryJobs
import Synchronization
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
        let captured = Mutex<[Job.Entry]>([])
        let recording = UUID()
        let file = SummaryTranscript(base: BoundaryTranscript(), folder: URL(fileURLWithPath: "/synthetic"), recording: recording, callbacks: .init(waiting: { _ in }, completed: { _, identity, entries, final, usable in
            #expect(identity == recording)
            #expect(final && usable)
            captured.withLock { $0 = entries }
        }))
        try await file.write(state)
        await file.close()
        #expect(captured.withLock { $0.map(\.text) } == ["My name is Alice."])
    }
}
private actor BoundaryTranscript: SessionTranscriptFile {
    func write(_ text: CallState) {}
    func close() {}
}
