import LiveText
@testable import Composer
import Foundation
import Testing
import TranscriptFormat
import CallText
import Reading
import CallDiarizer

@Suite(.timeLimit(.minutes(1)))
struct TranscriptTests {

    @Test(arguments: 0...4)
    func readersJoinWordsWithSingleSpaces(settledCount: Int) async throws {

        let words = [
            Word("One,", start: 1, end: 1.25), Word("two", start: 1.5, end: 2),
            Word("три", start: 2.25, end: 2.5), Word("four!", start: 2.75, end: 3),
        ]
        let state = try await publishedCall(status: .listening, mine: [
            .init(text: .init(id: 7, start: 1, end: 3, words: words, settledCount: settledCount)),
        ], theirs: [])
        let expected = [
            ("", "One, two три four!"), ("One,", "two три four!"),
            ("One, two", "три four!"), ("One, two три", "four!"), ("One, two три four!", ""),
        ][settledCount]

        #expect(readingText(state).entries == [
            .init(id: .init(speaker: .mine, localID: 7), start: 1, end: 3, settled: expected.0, pending: expected.1),
        ])
        #expect(Transcript.segments(from: state) == [
            .init(side: .mine, start: 1, settled: expected.0, pending: expected.1),
        ])
        var format = TranscriptFormat()
        let rendered = try format.render(Transcript.segments(from: state))
        #expect(String(decoding: rendered.chunks.reduce(into: Data()) { $0.append($1) }, as: UTF8.self)
            == "# Transcript\n\n**Me** 00:00:01\nOne, two три four!\n")
    }

    @Test func entryMappingTable() async throws {

        let mine: [SideState<TranscriptSegment>.Entry] = [
            .init(text: .init(id: 4, start: 1.5, end: 3, words: [.init("me", start: 1.5, end: 3), .init("next", start: 1.5, end: 3)], settledCount: 1), writtenLater: true),
            .init(text: .init(id: 8, start: 0, end: 1, words: [], settledCount: 0)),
        ]
        let theirs: [SideState<TranscriptSegment>.Entry] = [
            .init(text: .init(id: 9, start: 8.25, end: 10, words: [.init("them", start: 8.25, end: 10)], settledCount: 0)),
            .init(text: .init(id: 2, start: 4, end: 5, words: [.init("да", start: 4, end: 5)], settledCount: 1), writtenLater: true),
        ]
        let mapped: [TranscriptFormat.Segment] = [
            .init(side: .mine, start: 0, settled: "", pending: "", filledInLater: false),
            .init(side: .mine, start: 1.5, settled: "me", pending: "next", filledInLater: true),
            .init(side: .theirs, start: 4, settled: "да", pending: "", filledInLater: true),
            .init(side: .theirs, start: 8.25, settled: "", pending: "them", filledInLater: false),
        ]
        for status: CallState.Status in [.off, .gettingReady, .listening, .failed("failed"), .finished] {
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

struct RowSpeakersTests {

    private let two: [TranscriptFormat.Speaker] = [.init(id: "d3", name: nil, state: "diarized"), .init(id: "d5", name: nil, state: "diarized")]

    private func turn(_ speaker: Int, _ start: Double, _ end: Double) -> CallDiarizer.Turn { .init(speaker: speaker, start: start, end: end) }

    @Test func aPauseBeforeTheNextSpeakerCountsForNoOne() {
        let places = Composer.Transcript.rowSpeakers(rows: [(id: 1, start: 0, end: 10)],
                                                     turns: [turn(3, 0, 1), turn(5, 8, 10)], speakers: two)
        #expect(places == [1: 2])
    }

    @Test func aReturningSpeakersTimeAddsUp() {
        let places = Composer.Transcript.rowSpeakers(rows: [(id: 1, start: 0, end: 10)],
                                                     turns: [turn(3, 0, 2), turn(5, 2, 5), turn(3, 5, 7)], speakers: two)
        #expect(places == [1: 1])
    }

    @Test func addedUpTimesThatTieGoToTheEarlierPlace() {
        let places = Composer.Transcript.rowSpeakers(rows: [(id: 1, start: 0, end: 10)],
                                                     turns: [turn(5, 0, 2), turn(3, 2, 3), turn(5, 3, 4), turn(3, 4, 6)], speakers: two)
        #expect(places == [1: 1])
    }

    @Test func aRowNoTurnOverlapsHasNoPlace() {
        let places = Composer.Transcript.rowSpeakers(rows: [(id: 1, start: 0, end: 1), (id: 2, start: 5, end: 6)],
                                                     turns: [turn(3, 0, 1), turn(5, 2, 3)], speakers: two)
        #expect(places == [1: 1])
    }

    @Test func aLoneSpeakerGivesNoPlaces() {
        let places = Composer.Transcript.rowSpeakers(rows: [(id: 1, start: 0, end: 1)], turns: [turn(0, 0, 1)],
                                                     speakers: [.init(id: "d0", name: nil, state: "diarized")])
        #expect(places.isEmpty)
    }
}
