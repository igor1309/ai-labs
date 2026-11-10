import CallText
import Foundation
import SummaryJobs
import Synchronization
import Testing
@testable import Composer

@Suite(.timeLimit(.minutes(1)))
struct SummaryTranscriptBoundaryTests {
    @Test func disabledTextKeepsSettledAndPendingWordBoundariesAtHandoff() async throws {
        let state = try await publishedCall(status: .off, mine: [
            .init(text: .init(id: 1, start: 0, end: 1, settled: "My name is", pending: "Alice."))
        ], theirs: [])
        let captured = Mutex<[Job.Entry]>([])
        let file = SummaryTranscript(base: BoundaryTranscript(), folder: URL(fileURLWithPath: "/synthetic"), callbacks: .init(waiting: { _ in }, completed: { _, entries, final, usable in
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
