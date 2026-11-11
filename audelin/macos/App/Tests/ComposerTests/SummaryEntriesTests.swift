import SummaryJobs
import CallText
import LiveText
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

@Suite(.timeLimit(.minutes(1)))
struct AttributedSummaryEntriesTests {

    private let far = AttributedFar(
        far: [
            .init(side: .theirs, start: 1, settled: "first", pending: "", speaker: "d4"),
            .init(side: .theirs, start: 3, settled: "second", pending: "", speaker: "d0"),
        ],
        speakers: [.init(id: "d4", name: nil, state: "diarized"), .init(id: "d0", name: "Anna", state: "confirmed")]
    )

    private func call() async throws -> CallState {
        try await publishedCall(status: .finished, mine: [
            .init(text: .init(id: 1, start: 0, end: 1, words: [.init("hello", start: 0, end: 1)], settledCount: 1)),
        ], theirs: [
            .init(text: .init(id: 2, start: 1, end: 4, words: [.init("first", start: 1, end: 2), .init("second", start: 3, end: 4)], settledCount: 2)),
        ])
    }

    @Test func theFarSideReadsAsItsDiarizedSpeakers() async throws {

        let entries = summaryEntries(try await call(), attributed: far)
        #expect(entries.map(\.label) == ["Me", "Them 1", "Them 2"])
        #expect(entries.map(\.text) == ["hello", "first", "second"])
    }

    @Test func cleanedMicrophoneRowsJoinTheDiarizedFarSide() async throws {

        let heard = [TranscriptSegment(id: 9, start: 2, end: 2.5, words: [.init("cleaned", start: 2, end: 2.5)], settledCount: 1)]
        let entries = summaryEntries(try await call(), heard: heard, attributed: far)
        #expect(entries.map(\.label) == ["Them 1", "Me", "Them 2"])
        #expect(entries.map(\.text) == ["first", "cleaned", "second"])
    }

    @Test func withoutAttributionTheFarSideStaysAsWritten() async throws {

        #expect(summaryEntries(try await call(), attributed: nil).map(\.label) == ["Me", "Them"])
    }
}
