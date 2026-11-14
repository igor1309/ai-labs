import Foundation
import Testing
import TranscriptFormat

struct TranscriptReadingTests {

    @Test func readsBackEachPartWithItsLabelWholeSecondsAndWords() throws {

        let text = try rendered([
            .init(side: .mine, start: 65.99, settled: "hello", pending: "there"),
            .init(side: .theirs, start: 3_669.9, settled: "", pending: "back \\*as\\* typed", filledInLater: true),
        ])
        #expect(TranscriptFormat.entries(text) == [
            .init(label: "Me", start: 65, words: "hello there"),
            .init(label: "Them", start: 3_669, words: "back \\*as\\* typed"),
        ])
    }

    @Test func readsSpeakerLabelsAndSkipsTheSpeakersSection() throws {

        let text = try rendered([
            .init(side: .theirs, start: 1, settled: "first", pending: "", speaker: "a"),
            .init(side: .theirs, start: 2, settled: "second", pending: "", speaker: "b"),
        ], speakers: [.init(id: "a", name: "Ann", state: "named"), .init(id: "b", name: nil, state: "unknown")])
        #expect(text.contains("## Speakers"))
        #expect(TranscriptFormat.entries(text) == [
            .init(label: "Them 1", start: 1, words: "first"),
            .init(label: "Them 2", start: 2, words: "second"),
        ])
    }

    @Test func anHourTooLargeForWholeSecondsReadsWithoutTrapping() {

        let entries = TranscriptFormat.entries("**Me** 99999999999999999999:00:00\nслова\n")
        #expect(entries.map(\.words) == ["слова"])
        #expect(entries.map(\.start) == [Double(99999999999999999999.0) * 3_600])
    }

    @Test func noTextReadsAsNoParts() throws {

        #expect(TranscriptFormat.entries(try rendered([])) == [])
    }

    @Test func partsWithoutWordsAreSkipped() throws {

        let text = try rendered([
            .init(side: .mine, start: 1, settled: "", pending: " "),
            .init(side: .theirs, start: 2, settled: "words", pending: ""),
        ])
        #expect(TranscriptFormat.entries(text) == [.init(label: "Them", start: 2, words: "words")])
    }

    @Test func linesBeforeTheFirstPartAndBadHeadersAreNotParts() {

        let text = "# Transcript\n\nnotes by hand\n\n**Me** 00:00:07\nkept\n**Him** 00:00:08\nstill kept\n"
        #expect(TranscriptFormat.entries(text) == [.init(label: "Me", start: 7, words: "kept\n**Him** 00:00:08\nstill kept")])
    }

    @Test func wordsWithBlankLinesStayOnePart() throws {

        let text = try rendered([
            .init(side: .mine, start: 1, settled: "first\n\nsecond", pending: ""),
            .init(side: .theirs, start: 2, settled: "next", pending: ""),
        ])
        #expect(TranscriptFormat.entries(text) == [
            .init(label: "Me", start: 1, words: "first\n\nsecond"),
            .init(label: "Them", start: 2, words: "next"),
        ])
    }

    @Test func anEmptyPartDoesNotSwallowTheNext() throws {

        let text = try rendered([
            .init(side: .mine, start: 1, settled: "", pending: ""),
            .init(side: .theirs, start: 2, settled: "next", pending: ""),
        ])
        #expect(TranscriptFormat.entries(text) == [.init(label: "Them", start: 2, words: "next")])
    }

    @Test func crlfLineEndingsRead() {

        let text = "# Transcript\r\n\r\n**Me** 00:00:01\r\nhello\r\n\r\n**Them** 00:00:02\r\nthere\r\n"
        #expect(TranscriptFormat.entries(text) == [
            .init(label: "Me", start: 1, words: "hello"),
            .init(label: "Them", start: 2, words: "there"),
        ])
    }

    @Test func startsOfAHundredHoursAndMoreRead() throws {

        let text = try rendered([.init(side: .mine, start: 360_005, settled: "late", pending: "")])
        #expect(TranscriptFormat.entries(text) == [.init(label: "Me", start: 360_005, words: "late")])
    }

    @Test func aRenderedTranscriptReadsBackAndRendersTheSame() throws {

        let speakers: [TranscriptFormat.Speaker] = [.init(id: "a", name: "Ann", state: "named"), .init(id: "b", name: nil, state: "unknown")]
        let text = try rendered([
            .init(side: .mine, start: 1, settled: "hello", pending: ""),
            .init(side: .theirs, start: 5, settled: "hi from Ann", pending: "", speaker: "a"),
            .init(side: .theirs, start: 9, settled: "late words", pending: "", filledInLater: true, speaker: "b"),
            .init(side: .mine, start: 12, settled: "first\n\nsecond", pending: ""),
        ], speakers: speakers)
        let saved = TranscriptFormat.read(text)
        #expect(saved.speakers == speakers)
        #expect(saved.segments == [
            .init(side: .mine, start: 1, settled: "hello", pending: ""),
            .init(side: .theirs, start: 5, settled: "hi from Ann", pending: "", speaker: "a"),
            .init(side: .theirs, start: 9, settled: "late words", pending: "", filledInLater: true, speaker: "b"),
            .init(side: .mine, start: 12, settled: "first\n\nsecond", pending: ""),
        ])
        #expect(try rendered(saved.segments, speakers: saved.speakers) == text)
    }

    @Test func aLoneSpeakerAndPartsWithoutWordsReadBack() throws {

        let speakers: [TranscriptFormat.Speaker] = [.init(id: "a", name: "Ann", state: "named")]
        let text = try rendered([
            .init(side: .mine, start: 1, settled: "", pending: ""),
            .init(side: .theirs, start: 2, settled: "only them", pending: "", speaker: "a"),
        ], speakers: speakers)
        let saved = TranscriptFormat.read(text)
        #expect(saved.segments == [.init(side: .theirs, start: 2, settled: "only them", pending: "", speaker: "a")])
        #expect(saved.speakers == speakers)
        #expect(TranscriptFormat.entries(try rendered(saved.segments, speakers: saved.speakers)) == TranscriptFormat.entries(text))
    }

    @Test func aTranscriptWithoutSpeakersReadsWithNone() throws {

        let saved = TranscriptFormat.read(try rendered([.init(side: .theirs, start: 3, settled: "them", pending: "")]))
        #expect(saved == .init(segments: [.init(side: .theirs, start: 3, settled: "them", pending: "")], speakers: []))
    }

    @Test func aGapRendersAsTheCallCutOffAndReadsBack() throws {

        let segments: [TranscriptFormat.Segment] = [
            .init(side: .mine, start: 400, settled: "before", pending: ""),
            .gap(at: 480, length: 120),
            .init(side: .theirs, start: 600, settled: "after", pending: ""),
        ]
        let text = try rendered(segments)
        #expect(text.contains("**Gap** 00:08:00\nCut off for 00:02:00.\n"))
        let saved = TranscriptFormat.read(text)
        #expect(saved.segments == segments)
        #expect(saved.segments[1].gapLength == 120)
        #expect(try rendered(saved.segments) == text)
        #expect(TranscriptFormat.entries(text).map(\.words) == ["before", "after"])
    }

    @Test func onlyAGapSaysNoTextWasHeard() throws {

        #expect(try rendered([.gap(at: 0, length: 5)]) == "# Transcript\n\nNo text was heard.\n")
    }

    @Test func aGapOfNoLengthRenders() throws {

        let text = try rendered([.init(side: .mine, start: 1, settled: "a", pending: ""), .gap(at: 2, length: 0)])
        #expect(TranscriptFormat.read(text).segments.last == .gap(at: 2, length: 0))
    }

    @Test(arguments: [-1.0, .infinity, .nan])
    func aGapOfNoUsableLengthFails(length: Double) {

        var format = TranscriptFormat()
        #expect(throws: TranscriptFormat.Failure.invalidGap) {
            try format.render([.init(side: .mine, start: 1, settled: "a", pending: ""), .gap(at: 2, length: length)])
        }
    }
}

private func rendered(_ segments: [TranscriptFormat.Segment], speakers: [TranscriptFormat.Speaker] = []) throws -> String {

    var format = TranscriptFormat()
    let rendering = try format.render(segments, speakers: speakers)
    return rendering.chunks.map { String(decoding: $0, as: UTF8.self) }.joined()
}
