import Foundation
import Testing
@testable import TranscriptCore

/// Stabilizer QA scenarios (`docs/spec/stabilizer/QA.md`).
@Suite struct StabilizerTests {
    @Test func s1AWordWithFullRightContextCommits() throws {
        var stabilizer = Stabilizer(epoch: 0)

        let segmentFed = stabilizer.feed(window(0, 8, context: 6, [привет, как]))
        let segment = try #require(segmentFed)

        #expect(segment.words == [привет])
        #expect(segment.start == 1.6 && segment.end == 2.1)
    }

    @Test func s2AWordInTheRightContextStaysLive() {
        var stabilizer = Stabilizer(epoch: 0)

        let segment = stabilizer.feed(window(0, 8, context: 6, [привет, как]))

        #expect(stabilizer.tail == [как])
        #expect(segment?.words.contains(как) == false)
    }

    @Test func s3ANewerReadingReplacesTheTail() {
        var stabilizer = Stabilizer(epoch: 0)
        _ = stabilizer.feed(window(0, 6, context: 4, [word("рейси", 4.2, 4.7)]))

        _ = stabilizer.feed(window(2, 6, context: 4.5, [word("RACI", 4.2, 4.8)]))

        #expect(stabilizer.tail.map(\.text) == ["RACI"])
    }

    @Test func s4OverlappingWindowsCommitAWordOnce() {
        var stabilizer = Stabilizer(epoch: 0)
        let a = word("a", 1, 1.5), b = word("b", 3, 3.5), c = word("c", 4.5, 5), d = word("d", 6, 6.5)

        let words = stabilizer.run([
            window(0, 6, context: 4, [a, b, c]),
            window(4, 10, context: 8, [word("c", 4.52, 5.02), d]),
        ])

        #expect(words.map(\.text) == ["a", "b", "c", "d"])
    }

    @Test func s5CommitsKeepTimeOrder() throws {
        var stabilizer = Stabilizer(epoch: 0)
        _ = stabilizer.feed(window(0, 6, context: 4, [word("пять", 5, 5.5)]))

        let segmentFed = stabilizer.feed(window(5.2, 10, context: 8, [word("семь", 7, 7.4)]))
        let segment = try #require(segmentFed)

        #expect(segment.words.map(\.text) == ["пять", "семь"])
    }

    @Test func s6AnEpochsEndCommitsTheFinalReading() throws {
        var stabilizer = Stabilizer(epoch: 0)
        let first = stabilizer.feed(window(0, 6, context: 3, [word("рейси", 3.2, 3.7), word("план", 3.8, 4.3)]))

        let segmentFed = stabilizer.feed(
            window(2, 6, context: 6, [word("RACI", 3.2, 3.7), word("план", 3.8, 4.3)], epochEnd: true))
        let segment = try #require(segmentFed)

        #expect(first == nil)
        #expect(segment.text == "RACI план")
        #expect(stabilizer.tail.isEmpty)
    }

    @Test func s7NoSentenceAcrossAnEpoch() throws {
        var old = Stabilizer(epoch: 1)
        let endedFed = old.feed(
            window(34, 40, context: 40, [word("согласуем", 39, 39.6)], epochEnd: true))
        let ended = try #require(endedFed)
        let next = window(40, 48, context: 46, [word("план", 40.5, 41)])

        var new = Stabilizer(epoch: 2)
        let segmentFed = new.feed(next)
        let segment = try #require(segmentFed)

        #expect(old.feed(next) == nil)
        #expect(ended.epoch == 1 && ended.end <= 40)
        #expect(segment.epoch == 2 && segment.start >= 40)
    }

    @Test func s8WordsBeforeTheWatermarkAreDropped() {
        let план = word("план", 29.5, 29.9)
        let later = [word("в", 32, 32.2), word("работу", 35, 35.5)]
        let window = window(25, 40, context: 38, [word("мы", 26, 26.3), word("этот", 29, 29.4), план] + later)
        let shifted = window.shifted(by: 0.15)  // «план» re-reads ending at 30.05 s

        var first = Stabilizer(epoch: 0, watermark: 30, lastCommitted: [план])
        var second = Stabilizer(epoch: 0, watermark: 30, lastCommitted: [план])
        let firstRun = first.run([window])
        let secondRun = second.run([shifted.inserting(word("на", 30.1, 30.3))])
        // A short re-read word whose middle passes the watermark is matched
        // against the last committed words.
        var third = Stabilizer(epoch: 0, watermark: 30, lastCommitted: [план])
        let thirdRun = third.run([RecognitionWindow(
            start: 25, end: 40, rightContextFrom: 38, words: [word("план", 29.85, 30.25)])])

        #expect(firstRun.map(\.text) == ["в", "работу"])
        #expect(secondRun.map(\.text) == ["на", "в", "работу"])
        #expect(thirdRun.isEmpty)
    }

    @Test func s9AFailedWindow() {
        var stabilizer = Stabilizer(epoch: 0)
        _ = stabilizer.feed(window(0, 8, context: 6, [привет, как]))
        let before = (stabilizer.tail, stabilizer.watermark)

        stabilizer.windowFailed()

        #expect(stabilizer.tail == before.0 && stabilizer.watermark == before.1)
    }

    @Test func s10TheWatermarkFollowsCommits() {
        var stabilizer = Stabilizer(epoch: 0)

        _ = stabilizer.feed(window(0, 8, context: 6.1, [word("да", 5.5, 6), word("нет", 6.2, 6.6)]))

        #expect(stabilizer.watermark >= 6 && stabilizer.watermark < 6.2)
    }

    @Test func s11SilenceMovesTheWatermark() {
        var stabilizer = Stabilizer(epoch: 0)
        _ = stabilizer.feed(window(0, 8, context: 6.1, [word("да", 5.5, 6), word("нет", 6.2, 6.6)]))
        _ = stabilizer.feed(window(2, 10, context: 8, [word("нет", 6.2, 6.6)]))

        let segment = stabilizer.feed(window(8, 14, context: 12, []))

        #expect(segment == nil)
        #expect(stabilizer.watermark == 12)
    }

    @Test func s13CommittedTextStaysFinal() {
        var stabilizer = Stabilizer(epoch: 0)
        _ = stabilizer.feed(window(0, 8, context: 6, [привет]))

        let segment = stabilizer.feed(window(0.5, 10, context: 8, [word("привед", 1.62, 2.12)]))

        #expect(segment == nil)
    }

    /// The recorded «Пятница» runs from 44.40 s into the silence after it, to
    /// 49.84 s; the next window starts at 46 s and can never read it again.
    @Test func s14AWordNoLaterWindowCanReadCommits() throws {
        let windows = try Fixtures.terms(shift: "0")
        var stabilizer = Stabilizer(epoch: 0)
        _ = stabilizer.run(windows[...11])
        #expect(stabilizer.tail.map(\.text) == ["Пятница."])

        let segmentFed = stabilizer.feed(windows[12])
        let segment = try #require(segmentFed)

        #expect(segment.text == "Пятница.")
        #expect(stabilizer.tail.isEmpty)
        #expect(stabilizer.watermark == windows[12].rightContextFrom)
    }

    private let привет = word("привет", 1.6, 2.1)
    private let как = word("как", 6.0, 6.4)
}

private func word(_ text: String, _ start: TimeInterval, _ end: TimeInterval) -> Word {
    Word(text: text, start: start, end: end)
}

private func window(
    _ start: TimeInterval, _ end: TimeInterval, context: TimeInterval, _ words: [Word],
    epochEnd: Bool = false
) -> RecognitionWindow {
    RecognitionWindow(start: start, end: end, rightContextFrom: context, words: words, isEpochEnd: epochEnd)
}

private extension RecognitionWindow {
    /// The same window cut a few frames later: every reading moves with it.
    func shifted(by seconds: TimeInterval) -> RecognitionWindow {
        var copy = self
        copy.start += seconds
        copy.end += seconds
        copy.rightContextFrom += seconds
        copy.words = words.map { Word(text: $0.text, start: $0.start + seconds, end: $0.end + seconds) }
        return copy
    }

    func inserting(_ word: Word) -> RecognitionWindow {
        var copy = self
        copy.words = (words + [word]).sorted { $0.start < $1.start }
        return copy
    }
}
