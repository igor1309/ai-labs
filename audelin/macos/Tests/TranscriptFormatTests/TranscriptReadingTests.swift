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
}

private func rendered(_ segments: [TranscriptFormat.Segment], speakers: [TranscriptFormat.Speaker] = []) throws -> String {

    var format = TranscriptFormat()
    let rendering = try format.render(segments, speakers: speakers)
    return rendering.chunks.map { String(decoding: $0, as: UTF8.self) }.joined()
}
