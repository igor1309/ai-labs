@testable import Composer
import Foundation
import Testing
import TranscriptFile
import CallText

@Suite(.timeLimit(.minutes(1)))
struct TranscriptTests {

    @Test func entryMappingTable() async throws {

        let mine: [SideState.Entry] = [
            .init(text: .init(id: 4, start: 1.5, end: 3, settled: "me", pending: "next"), writtenLater: true),
            .init(text: .init(id: 8, start: 0, end: 1)),
        ]
        let theirs: [SideState.Entry] = [
            .init(text: .init(id: 9, start: 8.25, end: 10, pending: "them")),
            .init(text: .init(id: 2, start: 4, end: 5, settled: "да"), writtenLater: true),
        ]
        let mapped: [TranscriptFile.Segment] = [
            .init(side: .mine, start: 0, settled: "", pending: "", filledInLater: false),
            .init(side: .mine, start: 1.5, settled: "me", pending: "next", filledInLater: true),
            .init(side: .theirs, start: 4, settled: "да", pending: "", filledInLater: true),
            .init(side: .theirs, start: 8.25, settled: "", pending: "them", filledInLater: false),
        ]
        for status: State.Status in [.off, .gettingReady, .listening, .failed("failed"), .finished] {
            let empty = try await publishedCall(status: status, mine: [], theirs: [])
            #expect(Transcript.segments(from: empty) == [])
            let populated = try await publishedCall(status: status, mine: mine, theirs: theirs)
            #expect(Transcript.segments(from: populated) == mapped)
            for segment in mapped {
                let input = (segment.side == .mine ? mine : theirs).filter { $0.text.start == segment.start }
                let single = try await publishedCall(
                    status: status, mine: segment.side == .mine ? input : [],
                    theirs: segment.side == .theirs ? input : []
                )
                #expect(Transcript.segments(from: single) == [segment])
            }
        }
    }
}
