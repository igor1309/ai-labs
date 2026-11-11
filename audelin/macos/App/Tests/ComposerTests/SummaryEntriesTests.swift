import SummaryJobs
import Testing
import TranscriptFormat
@testable import Composer

@Suite(.timeLimit(.minutes(1)))
struct SummaryEntriesTests {

    private let rows: [TranscriptFormat.Segment] = [
        .init(side: .mine, start: 0, settled: "hi", pending: ""),
        .init(side: .theirs, start: 1, settled: "a", pending: "", speaker: "z2"),
        .init(side: .theirs, start: 2, settled: "b", pending: "", speaker: "z1"),
        .init(side: .theirs, start: 3, settled: "c", pending: ""),
    ]

    @Test func remoteSpeakersReadAsInTheTranscript() {

        #expect(summaryEntries(rows, speakerIDs: ["z1", "z2"]).map(\.label) == ["Me", "Them 2", "Them 1", "Them"])
    }

    @Test(arguments: [[String](), ["z2"]]) func aLoneOrUnlistedFarSideReadsAsThem(speakerIDs: [String]) {

        #expect(summaryEntries(rows, speakerIDs: speakerIDs).map(\.label) == ["Me", "Them", "Them", "Them"])
    }
}
