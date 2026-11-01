import Compose
import Foundation
import Testing
import TranscriptFile
@testable import CallText

@Suite(.timeLimit(.minutes(1)))
struct TranscriptTests {

    @Test func entryMappingTable() {

        let entries: [State.Entry] = [
            .init(speaker: .theirs, text: .init(id: 9, start: 8.25, end: 10, pending: "them"), writtenLater: false),
            .init(speaker: .mine, text: .init(id: 4, start: 1.5, end: 3, settled: "me", pending: "next"), writtenLater: true),
            .init(speaker: .theirs, text: .init(id: 2, start: 4, end: 5, settled: "да"), writtenLater: true),
            .init(speaker: .mine, text: .init(id: 8, start: 0, end: 1), writtenLater: false),
        ]
        let mapped: [TranscriptFile.Segment] = [
            .init(side: .theirs, start: 8.25, settled: "", pending: "them", filledInLater: false),
            .init(side: .mine, start: 1.5, settled: "me", pending: "next", filledInLater: true),
            .init(side: .theirs, start: 4, settled: "да", pending: "", filledInLater: true),
            .init(side: .mine, start: 0, settled: "", pending: "", filledInLater: false),
        ]
        for status: State.Status in [.off, .gettingReady, .listening, .failed("failed"), .finished] {
            #expect(Transcript.segments(from: State(status: status, entries: [])) == [])
            #expect(Transcript.segments(from: State(status: status, entries: .init(tail: entries))) == mapped)
            for (entry, segment) in zip(entries, mapped) {
                #expect(Transcript.segments(from: State(status: status, entries: [entry])) == [segment])
            }
        }
    }
}
