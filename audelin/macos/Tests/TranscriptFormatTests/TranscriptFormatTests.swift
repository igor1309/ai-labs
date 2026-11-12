import Foundation
import Synchronization
import Testing
import TranscriptFormat

@Suite(.timeLimit(.minutes(1)))
struct TranscriptFormatTests {

    @Test func interleavedSegmentsKeepOrderTimesAndAllWords() throws {

        var format = TranscriptFormat()
        var rendering: TranscriptFormat.Rendering
        rendering = try format.render([
            .init(side: .mine, start: 65.99, settled: "1 settled", pending: ""),
            .init(side: .theirs, start: 3_669.9, settled: "", pending: "2 pending"),
            .init(side: .mine, start: 0.99, settled: "3 settled", pending: "3 pending"),
            .init(side: .theirs, start: 60, settled: "4 settled", pending: "4 pending"),
        ])
        #expect(markdown(rendering) == """
            # Transcript

            **Me** 00:01:05
            1 settled

            **Them** 01:01:09
            2 pending

            **Me** 00:00:00
            3 settled 3 pending

            **Them** 00:01:00
            4 settled 4 pending

            """)
    }

    @Test func revisionReplacesPendingWordsAndDroppedSegments() throws {

        var format = TranscriptFormat()
        var rendering: TranscriptFormat.Rendering
        rendering = try format.render([
            .init(side: .mine, start: 1, settled: "1 old", pending: "1 pending"),
            .init(side: .theirs, start: 2, settled: "", pending: "2 pending"),
            .init(side: .mine, start: 3, settled: "3 dropped", pending: ""),
        ])
        rendering = try format.render([
            .init(side: .mine, start: 1, settled: "1 revised", pending: ""),
            .init(side: .theirs, start: 2, settled: "2 revised", pending: ""),
        ])
        #expect(markdown(rendering) == "# Transcript\n\n**Me** 00:00:01\n1 revised\n\n**Them** 00:00:02\n2 revised\n")
    }

    @Test func onlyLaterSegmentsAreMarked() throws {

        var format = TranscriptFormat()
        var rendering: TranscriptFormat.Rendering
        rendering = try format.render([
            .init(side: .mine, start: 1, settled: "1 live", pending: ""),
            .init(side: .theirs, start: 2, settled: "2 later", pending: "", filledInLater: true),
            .init(side: .mine, start: 3, settled: "", pending: "3 later", filledInLater: true),
            .init(side: .theirs, start: 4, settled: "4 live", pending: ""),
        ])
        #expect(markdown(rendering) == """
            # Transcript

            **Me** 00:00:01
            1 live

            **Them** 00:00:02 (filled in later)
            2 later

            **Me** 00:00:03 (filled in later)
            3 later

            **Them** 00:00:04
            4 live

            """)
    }

    @Test func emptyWritesReplaceTextWithNoTextMessage() throws {

        var format = TranscriptFormat()
        var rendering: TranscriptFormat.Rendering
        for _ in 0..<2 {
            rendering = try format.render([])
            #expect(markdown(rendering) == noTextTranscript)
        }
        rendering = try format.render(numberedSegments(1))
        rendering = try format.render([])
        #expect(markdown(rendering) == noTextTranscript)
        rendering = try format.render([
            .init(side: .mine, start: 0, settled: "", pending: ""),
            .init(side: .theirs, start: 2, settled: " \n", pending: "\t"),
        ])
        #expect(markdown(rendering) == noTextTranscript)
    }

    @Test func mixedEmptySegmentsKeepTheirPlaceAndUnicodeWords() throws {

        var format = TranscriptFormat()
        var rendering: TranscriptFormat.Rendering
        rendering = try format.render([
            .init(side: .mine, start: 1, settled: "", pending: ""),
            .init(side: .theirs, start: 2, settled: "Привет", pending: "世界"),
            .init(side: .mine, start: 3, settled: "", pending: ""),
        ])
        #expect(markdown(rendering) == "# Transcript\n\n**Me** 00:00:01\n\n\n**Them** 00:00:02\nПривет 世界\n\n**Me** 00:00:03\n\n")
    }

    @Test func longCallTimesKeepAllHourDigits() throws {

        var format = TranscriptFormat()
        var rendering: TranscriptFormat.Rendering
        rendering = try format.render([.init(side: .mine, start: 10_800_000_000_065.9, settled: "1", pending: "")])
        #expect(markdown(rendering) == "# Transcript\n\n**Me** 3000000000:01:05\n1\n")
    }

    @Test func anEarlierSegmentChangingOrGoingIsWrittenEvenAfterAFailedWrite() throws {

        var format = TranscriptFormat()
        var rendering: TranscriptFormat.Rendering
        let first = TranscriptFormat.Segment(side: .mine, start: 0, settled: "one", pending: "")
        let second = TranscriptFormat.Segment(side: .theirs, start: 2, settled: "two", pending: "")
        rendering = try format.render([first, second])
        #expect(throws: TranscriptFormat.Failure.invalidStart) {
            rendering = try format.render([.init(side: .mine, start: 0, settled: "changed", pending: ""),
                                  .init(side: .theirs, start: -1, settled: "bad", pending: "")])
        }
        #expect(markdown(rendering) == "# Transcript\n\n**Me** 00:00:00\none\n\n**Them** 00:00:02\ntwo\n")
        rendering = try format.render([.init(side: .mine, start: 0, settled: "again", pending: "now"), second])
        #expect(markdown(rendering) == "# Transcript\n\n**Me** 00:00:00\nagain now\n\n**Them** 00:00:02\ntwo\n")
        rendering = try format.render([second])
        #expect(markdown(rendering) == "# Transcript\n\n**Them** 00:00:02\ntwo\n")
    }

    @Test func finalSegmentsAreAskedForOnlyUntilTheyAreFinal() throws {

        var format = TranscriptFormat()
        var rendering = try format.render([])
        let segments = (0..<5).map { TranscriptFormat.Segment(side: .mine, start: Double($0), settled: "w\($0)", pending: "") }
        let asked = Mutex<[Int]>([])
        func write(count: Int, finalCount: Int) throws -> [Int] {
            asked.withLock { $0 = [] }
            rendering = try format.render(count: count, finalCount: finalCount) { index in
                asked.withLock { $0.append(index) }
                return segments[index]
            }
            return asked.withLock { $0 }
        }
        func whole(_ count: Int) -> String {
            "# Transcript\n\n" + (0..<count).map { "**Me** 00:00:0\($0)\nw\($0)" }.joined(separator: "\n\n") + "\n"
        }
        #expect(try write(count: 2, finalCount: 0) == [0, 1])
        #expect(markdown(rendering) == whole(2))
        // Several become final at once when writes coalesce.
        #expect(try write(count: 4, finalCount: 3) == [0, 1, 2, 3])
        #expect(markdown(rendering) == whole(4))
        #expect(try write(count: 5, finalCount: 3) == [3, 4])
        #expect(markdown(rendering) == whole(5))
        #expect(try write(count: 5, finalCount: 5) == [3, 4])
        #expect(markdown(rendering) == whole(5))
        #expect(try write(count: 5, finalCount: 5) == [])
        #expect(markdown(rendering) == whole(5))
    }

    @Test func aTailChangingOrGoingLeavesTheFinalTextInPlace() throws {

        var format = TranscriptFormat()
        var rendering: TranscriptFormat.Rendering
        let final = TranscriptFormat.Segment(side: .mine, start: 0, settled: "one", pending: "")
        let tail = TranscriptFormat.Segment(side: .theirs, start: 2, settled: "two", pending: "")
        rendering = try format.render(count: 2, finalCount: 1) { [final, tail][$0] }
        #expect(markdown(rendering) == "# Transcript\n\n**Me** 00:00:00\none\n\n**Them** 00:00:02\ntwo\n")
        let revised = TranscriptFormat.Segment(side: .theirs, start: 2, settled: "too", pending: "more")
        rendering = try format.render(count: 2, finalCount: 1) { [final, revised][$0] }
        #expect(markdown(rendering) == "# Transcript\n\n**Me** 00:00:00\none\n\n**Them** 00:00:02\ntoo more\n")
        rendering = try format.render(count: 1, finalCount: 1) { _ in final }
        #expect(markdown(rendering) == "# Transcript\n\n**Me** 00:00:00\none\n")
    }

    @Test func wordlessFinalSegmentsStillMeanNoTextUntilWordsArrive() throws {

        var format = TranscriptFormat()
        var rendering: TranscriptFormat.Rendering
        let empty = TranscriptFormat.Segment(side: .mine, start: 0, settled: "", pending: "")
        let words = TranscriptFormat.Segment(side: .theirs, start: 2, settled: "two", pending: "")
        rendering = try format.render(count: 1, finalCount: 1) { _ in empty }
        #expect(markdown(rendering) == noTextTranscript)
        rendering = try format.render(count: 2, finalCount: 1) { [empty, words][$0] }
        #expect(markdown(rendering) == "# Transcript\n\n**Me** 00:00:00\n\n\n**Them** 00:00:02\ntwo\n")
        rendering = try format.render(count: 1, finalCount: 1) { _ in empty }
        #expect(markdown(rendering) == noTextTranscript)
        #expect(rendering.finalLength == nil)
    }

    @Test(arguments: [-1.0, Double.nan, .infinity, -.infinity, Double(Int.max)])
    func invalidStartsFailWithoutReplacingText(start: Double) throws {

        var format = TranscriptFormat()
        var rendering: TranscriptFormat.Rendering
        rendering = try format.render(numberedSegments(1))
        #expect(throws: TranscriptFormat.Failure.invalidStart) {
            rendering = try format.render([.init(side: .mine, start: start, settled: "invalid", pending: "")])
        }
        #expect(markdown(rendering) == numberedTranscript(1))
        rendering = try format.render(numberedSegments(2))
        #expect(markdown(rendering) == numberedTranscript(2))
    }

    @Test func textGoingAfterFinalEntriesWithoutWordsSaysNoTextWasHeard() throws {

        var format = TranscriptFormat()
        var rendering: TranscriptFormat.Rendering
        let silent = TranscriptFormat.Segment(side: .mine, start: 1, settled: "", pending: "")
        let live = TranscriptFormat.Segment(side: .theirs, start: 2, settled: "", pending: "words")
        rendering = try format.render(count: 2, finalCount: 1) { [silent, live][$0] }
        rendering = try format.render(count: 2, finalCount: 1) { [silent, live][$0] }
        rendering = try format.render(count: 1, finalCount: 1) { [silent][$0] }
        #expect(markdown(rendering) == noTextTranscript)
        rendering = try format.render(count: 2, finalCount: 1) { [silent, live][$0] }
        #expect(markdown(rendering) == "# Transcript\n\n**Me** 00:00:01\n\n\n**Them** 00:00:02\nwords\n")
    }

    @Test func rowsKeepGenericIDsAndNamesLiveInOneBlock() throws {

        var format = TranscriptFormat()
        var rendering: TranscriptFormat.Rendering
        rendering = try format.render([
            .init(side: .mine, start: 1, settled: "привет", pending: ""),
            .init(side: .theirs, start: 2, settled: "hello", pending: "", speaker: "s3"),
        ], speakers: [.init(id: "s3", name: "Anna", state: "confirmed")])
        #expect(markdown(rendering) == """
            # Transcript

            **Me** 00:00:01
            привет

            **Them** 00:00:02
            hello

            ## Speakers

            - Them: Anna

            <!-- audelin-speakers {"revision":1,"schemaVersion":1,"speakers":[{"id":"s3","name":"Anna","state":"confirmed"}]} -->

            """)
    }

    @Test func remoteSpeakersAreNumberedByTheirPlaceInTheSpeakerList() throws {

        var format = TranscriptFormat()
        let rendering = try format.render([
            .init(side: .theirs, start: 1, settled: "a", pending: "", speaker: "z2"),
            .init(side: .theirs, start: 2, settled: "b", pending: "", speaker: "z1"),
            .init(side: .theirs, start: 3, settled: "c", pending: "", speaker: "z9"),
            .init(side: .theirs, start: 4, settled: "d", pending: ""),
        ], speakers: [.init(id: "z1", name: nil, state: "tentative"), .init(id: "z2", name: "Anna", state: "tentative")])
        let text = markdown(rendering)
        #expect(text.contains("**Them 2** 00:00:01\na\n\n**Them 1** 00:00:02\nb\n\n**Them** 00:00:03\nc\n\n**Them** 00:00:04\nd\n"))
        #expect(text.contains("- Them 1: unknown\n- Them 2: Anna\n"))
    }

    @Test func aPendingRowTakesItsNumberOnceItsSpeakerIsListed() throws {

        var format = TranscriptFormat()
        let row = TranscriptFormat.Segment(side: .theirs, start: 2, settled: "hello", pending: "", speaker: "z1")
        _ = try format.render(count: 1, finalCount: 0) { _ in row }
        let rendering = try format.render(count: 1, finalCount: 0, speakers: [.init(id: "z1", name: nil, state: "tentative")]) { _ in row }
        #expect(markdown(rendering).contains("**Them** 00:00:02\nhello\n"))
    }

    @Test(arguments: [0, 1]) func aCachedRowTakesItsNumberWhenASecondSpeakerIsListed(finalCount: Int) throws {

        var format = TranscriptFormat()
        let row = TranscriptFormat.Segment(side: .theirs, start: 2, settled: "hello", pending: "", speaker: "z1")
        let first: TranscriptFormat.Speaker = .init(id: "z1", name: nil, state: "tentative")
        _ = try format.render(count: 1, finalCount: 0, speakers: [first]) { _ in row }
        let rendering = try format.render(count: 1, finalCount: finalCount,
                                          speakers: [first, .init(id: "z2", name: nil, state: "tentative")]) { _ in row }
        #expect(markdown(rendering).contains("**Them 1** 00:00:02\nhello\n"))
    }

    @Test func aFinalRowKeepsItsNumberAsTheListGrows() throws {

        var format = TranscriptFormat()
        let rows: [TranscriptFormat.Segment] = [
            .init(side: .theirs, start: 1, settled: "a", pending: "", speaker: "z1"),
            .init(side: .theirs, start: 2, settled: "b", pending: "", speaker: "z2"),
        ]
        let first: TranscriptFormat.Speaker = .init(id: "z1", name: nil, state: "tentative")
        _ = try format.render(count: 1, finalCount: 1, speakers: [first]) { rows[$0] }
        let rendering = try format.render(count: 2, finalCount: 1, speakers: [first, .init(id: "z2", name: nil, state: "tentative")]) { rows[$0] }
        #expect(markdown(rendering).contains("**Them 1** 00:00:01\na\n\n**Them 2** 00:00:02\nb\n"))
    }

    @Test func finalRowsOfALoneSpeakerTakeNumbersWhenASecondIsListed() throws {

        var format = TranscriptFormat()
        let rows: [TranscriptFormat.Segment] = [
            .init(side: .mine, start: 0, settled: "hi", pending: ""),
            .init(side: .theirs, start: 1, settled: "a", pending: "", speaker: "z1"),
            .init(side: .theirs, start: 2, settled: "b", pending: "", speaker: "z2"),
        ]
        let first: TranscriptFormat.Speaker = .init(id: "z1", name: "Anna", state: "tentative")
        var rendering = try format.render(count: 2, finalCount: 2, speakers: [first]) { rows[$0] }
        #expect(markdown(rendering).hasPrefix("# Transcript\n\n**Me** 00:00:00\nhi\n\n**Them** 00:00:01\na\n\n## Speakers\n\n- Them: Anna\n"))
        rendering = try format.render(count: 3, finalCount: 3, speakers: [first, .init(id: "z2", name: nil, state: "tentative")]) { rows[$0] }
        #expect(markdown(rendering).hasPrefix(
            "# Transcript\n\n**Me** 00:00:00\nhi\n\n**Them 1** 00:00:01\na\n\n**Them 2** 00:00:02\nb\n\n## Speakers\n\n- Them 1: Anna\n- Them 2: unknown\n"))
    }

    @Test func renamingRewritesOnlyTheBlockAndFinalRowsStay() throws {

        var format = TranscriptFormat()
        var rendering: TranscriptFormat.Rendering
        let row = TranscriptFormat.Segment(side: .theirs, start: 2, settled: "hello", pending: "", speaker: "s3")
        rendering = try format.render(count: 1, finalCount: 1, speakers: [.init(id: "s3", name: "Anna", state: "confirmed")]) { _ in row }
        rendering = try format.render(count: 1, finalCount: 1, speakers: [.init(id: "s3", name: nil, state: "disputed")]) { _ in row }
        let text = markdown(rendering)
        #expect(text.contains("**Them** 00:00:02\nhello\n"))
        #expect(text.contains("- Them: unknown"))
        #expect(!text.contains("Anna"))
        #expect(text.contains("\"revision\":2"))
    }

    @Test func hostileNamesCannotBreakTheFile() throws {

        var format = TranscriptFormat()
        var rendering: TranscriptFormat.Rendering
        rendering = try format.render([.init(side: .theirs, start: 0, settled: "hi", pending: "", speaker: "s1")],
                             speakers: [.init(id: "s1", name: "**Eve** -->\n# x", state: "confirmed")])
        let text = markdown(rendering)
        #expect(text.contains("- Them: \\*\\*Eve\\*\\* --\\> \\# x\n"))
        #expect(text.components(separatedBy: "-->").count == 2)
    }

    @Test func finalPrefixLengthsFollowGrowingFinalText() throws {

        var format = TranscriptFormat()
        let first = TranscriptFormat.Segment(side: .mine, start: 1, settled: "1 final Привет", pending: "")
        let second = TranscriptFormat.Segment(side: .theirs, start: 2, settled: "2 final 世界", pending: "")
        let third = TranscriptFormat.Segment(side: .mine, start: 3, settled: "", pending: "3 pending")
        let prefix = "# Transcript\n\n**Me** 00:00:01\n1 final Привет\n\n"
        var earlier = Data(prefix.utf8)
        for (segments, finalCount, askedFor, expected) in [
            ([first, .init(side: .theirs, start: 2, settled: "", pending: "2")], 1, [0, 1], prefix + "**Them** 00:00:02\n2\n"),
            ([first, .init(side: .theirs, start: 2, settled: "", pending: "2 growing")], 1, [1], prefix + "**Them** 00:00:02\n2 growing\n"),
            ([first, second], 2, [1], prefix + "**Them** 00:00:02\n2 final 世界\n"),
            ([first, second, third], 2, [2], prefix + "**Them** 00:00:02\n2 final 世界\n\n**Me** 00:00:03\n3 pending\n"),
        ] {
            var asked: [Int] = []
            let rendering = try format.render(count: segments.count, finalCount: finalCount) {
                asked.append($0)
                return segments[$0]
            }
            let bytes = rendering.chunks.reduce(Data(), +)
            #expect(asked == askedFor)
            #expect(bytes.starts(with: earlier))
            #expect(markdown(rendering) == expected)
            let length = try #require(rendering.finalLength)
            let expectedFinal = finalCount == 1 ? prefix : prefix + "**Them** 00:00:02\n2 final 世界\n" + (segments.count > 2 ? "\n" : "")
            #expect(length == expectedFinal.utf8.count)
            earlier = Data(bytes.prefix(length))
        }
    }

    @Test func failedRenderingKeepsTheFinalTextAndLength() throws {

        var format = TranscriptFormat()
        let first = TranscriptFormat.Segment(side: .mine, start: 1, settled: "1 final", pending: "")
        let second = TranscriptFormat.Segment(side: .theirs, start: 2, settled: "", pending: "2 pending")
        let before = try format.render(count: 2, finalCount: 1) { [first, second][$0] }
        #expect(throws: TranscriptFormat.Failure.invalidStart) {
            try format.render(count: 3, finalCount: 3) {
                [first, second, .init(side: .mine, start: .nan, settled: "bad", pending: "")][$0]
            }
        }
        var asked: [Int] = []
        let after = try format.render(count: 2, finalCount: 1) {
            asked.append($0)
            return [first, second][$0]
        }
        #expect(asked == [1])
        #expect(after.finalLength == before.finalLength)
        #expect(after.chunks == before.chunks)
        #expect(markdown(after) == "# Transcript\n\n**Me** 00:00:01\n1 final\n\n**Them** 00:00:02\n2 pending\n")
    }

    @Test func replacementStartsFromNothing() throws {

        var format = TranscriptFormat()
        _ = try format.render(count: 1, finalCount: 1) { _ in
            .init(side: .mine, start: 1, settled: "1 old final", pending: "")
        }
        format = TranscriptFormat()
        let replacement = try format.render(count: 1, finalCount: 1) { _ in
            .init(side: .theirs, start: 2, settled: "2 new final", pending: "")
        }
        let expected = "# Transcript\n\n**Them** 00:00:02\n2 new final\n"
        #expect(markdown(replacement) == expected)
        #expect(replacement.finalLength == expected.utf8.count)
    }

    @Test func speakersHaveStableIDsAndDecodableCurrentNames() throws {

        struct Metadata: Decodable {
            let schemaVersion: Int
            let revision: Int
            let speakers: [TranscriptFormat.Speaker]
        }
        var format = TranscriptFormat()
        let rows: [TranscriptFormat.Segment] = [
            .init(side: .theirs, start: 1, settled: "1 hello", pending: "", speaker: "s1"),
            .init(side: .theirs, start: 2, settled: "2 hello", pending: "", speaker: "s2"),
        ]
        for revision in 1...2 {
            let speakers: [TranscriptFormat.Speaker] = [
                .init(id: "s1", name: revision == 1 ? "Anna" : "**Eve** -->\n# x", state: "confirmed"),
                .init(id: "s2", name: nil, state: "unknown"),
            ]
            let rendering = try format.render(count: 2, finalCount: 2, speakers: speakers) { rows[$0] }
            #expect(rendering.finalLength == nil)
            let text = markdown(rendering)
            let parts = text.components(separatedBy: "<!-- audelin-speakers ")
            #expect(parts.count == 2)
            let json = try #require(parts.last?.components(separatedBy: " -->").first)
            let metadata = try JSONDecoder().decode(Metadata.self, from: Data(json.utf8))
            #expect(metadata.schemaVersion == 1)
            #expect(metadata.revision == revision)
            #expect(metadata.speakers == speakers)
            let readable = try #require(parts.first)
            let name = revision == 1 ? "Anna" : "\\*\\*Eve\\*\\* --\\> \\# x"
            #expect(readable == "# Transcript\n\n**Them 1** 00:00:01\n1 hello\n\n**Them 2** 00:00:02\n2 hello\n\n## Speakers\n\n- Them 1: \(name)\n- Them 2: unknown\n\n")
            #expect(text.components(separatedBy: "-->").count == 2)
        }
    }

}

private func markdown(_ rendering: TranscriptFormat.Rendering) -> String {
    rendering.chunks.map { String(decoding: $0, as: UTF8.self) }.joined()
}

private let noTextTranscript = "# Transcript\n\nNo text was heard.\n"

private func numberedSegments(_ number: Int) -> [TranscriptFormat.Segment] {
    [
        .init(side: .mine, start: 1, settled: "\(number) mine settled", pending: "\(number) mine pending"),
        .init(side: .theirs, start: 2, settled: "\(number) theirs settled", pending: "\(number) theirs pending"),
    ]
}

private func numberedTranscript(_ number: Int) -> String {
    "# Transcript\n\n**Me** 00:00:01\n\(number) mine settled \(number) mine pending\n\n**Them** 00:00:02\n\(number) theirs settled \(number) theirs pending\n"
}
