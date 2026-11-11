import SpeakerAttribution
import Testing

struct SpeakerAttributionTests {
    typealias Turn = SpeakerAttribution.Turn
    private typealias Piece = SpeakerAttribution.Piece<TestSegment>

    @Test func aSegmentOneSpeakerSaidIsTheirs() {
        let segment = TestSegment(0, 5, words: [1...2, 3...4])
        #expect(attribute([segment], [Turn(speaker: 7, start: 0, end: 5)]) == [Piece(segment: segment, speaker: 7)])
    }

    @Test func aSegmentIsSplitWhereTheSpeakerChanges() {
        let segment = TestSegment(0, 10, words: [1...2, 3...4, 6...7, 8...9])
        #expect(attribute([segment], [Turn(speaker: 4, start: 0, end: 5), Turn(speaker: 9, start: 5, end: 10)]) == [
            Piece(segment: segment.piece(words: 0..<2, start: 0, end: 6), speaker: 4),
            Piece(segment: segment.piece(words: 2..<4, start: 6, end: 10), speaker: 9),
        ])
    }

    @Test func aWordBetweenTwoTurnsGoesToTheOneOverlappingMoreOfIt() {
        let segment = TestSegment(0, 1, words: [0...1])
        #expect(attribute([segment], [Turn(speaker: 0, start: 0, end: 0.1), Turn(speaker: 1, start: 0.7, end: 1)]) == [Piece(segment: segment, speaker: 1)])
    }

    @Test func aSpeakersTurnsAreSummedOverAWord() {
        let segment = TestSegment(0, 1, words: [0...1])
        #expect(attribute([segment], [
            Turn(speaker: 1, start: 0, end: 0.3),
            Turn(speaker: 0, start: 0.5, end: 0.7), Turn(speaker: 0, start: 0.8, end: 1),
        ]) == [Piece(segment: segment, speaker: 0)])
    }

    @Test func aTiedWordGoesToTheTurnThatStartedFirst() {
        let segment = TestSegment(5, 8, words: [5...8])
        #expect(attribute([segment], [
            Turn(speaker: 0, start: 0, end: 1), Turn(speaker: 0, start: 7, end: 9),
            Turn(speaker: 1, start: 4, end: 6),
        ]) == [Piece(segment: segment, speaker: 1)])
    }

    @Test func aTieBetweenTurnsStartingTogetherGoesToTheLowerSpeaker() {
        let segment = TestSegment(1, 2, words: [1...2])
        #expect(attribute([segment], [Turn(speaker: 8, start: 0, end: 3), Turn(speaker: 2, start: 0, end: 3)]) == [Piece(segment: segment, speaker: 2)])
    }

    @Test func aWordInAGapAfterAHeardWordStaysWithIt() {
        let segment = TestSegment(0, 8, words: [1...2, 3...4, 6...7])
        #expect(attribute([segment], [Turn(speaker: 2, start: 0, end: 2), Turn(speaker: 5, start: 6, end: 8)]) == [
            Piece(segment: segment.piece(words: 0..<2, start: 0, end: 6), speaker: 2),
            Piece(segment: segment.piece(words: 2..<3, start: 6, end: 8), speaker: 5),
        ])
    }

    @Test func wordsBeforeTheFirstHeardWordTakeItsSpeaker() {
        let segment = TestSegment(0, 8, words: [1...2, 3...4, 6...7])
        #expect(attribute([segment], [Turn(speaker: 5, start: 6, end: 8)]) == [Piece(segment: segment, speaker: 5)])
    }

    @Test func aSegmentWithoutWordsTakesTheSpeakerOverlappingMoreOfIt() {
        let segment = TestSegment(0, 10, words: [])
        #expect(attribute([segment], [Turn(speaker: 2, start: 0, end: 2), Turn(speaker: 5, start: 3, end: 8)]) == [Piece(segment: segment, speaker: 5)])
    }

    @Test func turnsBetweenASegmentsWordsDecideItWhole() {
        let segment = TestSegment(0, 10, words: [0...1, 9...10])
        #expect(attribute([segment], [Turn(speaker: 2, start: 2, end: 3), Turn(speaker: 5, start: 4, end: 8)]) == [Piece(segment: segment, speaker: 5)])
    }

    @Test func aSegmentNoTurnOverlapsTakesTheNearestSpeaker() {
        let segment = TestSegment(5, 6, words: [5...6])
        #expect(attribute([segment], [Turn(speaker: 2, start: 0, end: 1), Turn(speaker: 5, start: 7, end: 8)]) == [Piece(segment: segment, speaker: 5)])
    }

    @Test func equallyNearTurnsGoToTheEarlier() {
        let segment = TestSegment(4, 6, words: [])
        #expect(attribute([segment], [Turn(speaker: 2, start: 7, end: 9), Turn(speaker: 5, start: 1, end: 3)]) == [Piece(segment: segment, speaker: 5)])
    }

    @Test func aMinorSpeakersWordsGoToARemainingSpeaker() {
        let segment = TestSegment(5, 6, words: [5...6])
        #expect(attribute([segment], [Turn(speaker: 0, start: 0, end: 24), Turn(speaker: 1, start: 5, end: 6)]) == [Piece(segment: segment, speaker: 0)])
    }

    @Test func aMinorSpeakersLoneSegmentGoesToTheNearestRemainingSpeaker() {
        let segment = TestSegment(42, 43, words: [42...43])
        #expect(attribute([segment], [
            Turn(speaker: 0, start: 0, end: 40), Turn(speaker: 1, start: 42, end: 43),
            Turn(speaker: 2, start: 44, end: 103),
        ]) == [Piece(segment: segment, speaker: 2)])
    }

    @Test func aSpeakerAtTheLeastShareThatCountsIsKept() {
        let segment = TestSegment(19, 20, words: [19...20])
        #expect(attribute([segment], [Turn(speaker: 0, start: 0, end: 19), Turn(speaker: 1, start: 19, end: 20)]) == [Piece(segment: segment, speaker: 1)])
    }

    @Test func speakersAllUnderTheShareAreAllKept() {
        let segments: [TestSegment] = (0..<21).map { index in
            let start = Double(index), end = start + 1
            return TestSegment(start, end, words: [start...end])
        }
        let turns = (0..<21).map { Turn(speaker: $0, start: Double($0), end: Double($0 + 1)) }
        #expect(attribute(segments, turns) == segments.enumerated().map { Piece(segment: $0.element, speaker: $0.offset) })
    }

    @Test func noTurnsLeaveEverySegmentWithoutASpeaker() {
        let segments = [TestSegment(0, 1, words: [0...1]), TestSegment(2, 3, words: [])]
        #expect(attribute(segments, []) == segments.map { Piece(segment: $0, speaker: nil) })
    }

    private func attribute(_ segments: [TestSegment], _ turns: [Turn]) -> [Piece] {
        SpeakerAttribution().attribute(segments, turns: turns)
    }
}

private struct TestSegment: SpeakerSegment, Equatable, Sendable {
    let start: Double
    let end: Double
    let words: [Int]
    let wordTimes: [SpeakerAttribution.WordTime]
    let split: Bool

    init(_ start: Double, _ end: Double, words: [ClosedRange<Double>]) {
        self.start = start; self.end = end
        self.words = Array(words.indices)
        self.wordTimes = words.map { .init(start: $0.lowerBound, end: $0.upperBound) }
        self.split = false
    }

    private init(start: Double, end: Double, words: [Int], wordTimes: [SpeakerAttribution.WordTime]) {
        self.start = start; self.end = end; self.words = words; self.wordTimes = wordTimes; self.split = true
    }

    func piece(words: Range<Int>, start: Double, end: Double) -> Self {
        Self(start: start, end: end, words: Array(self.words[words]), wordTimes: Array(wordTimes[words]))
    }
}
