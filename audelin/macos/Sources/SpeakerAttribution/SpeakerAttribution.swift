/// What attribution reads of a segment, and how it splits one.
public protocol SpeakerSegment {
    var start: Double { get }
    var end: Double { get }
    /// Each word's start and end, in order.
    var wordTimes: [SpeakerAttribution.WordTime] { get }
    /// The piece holding the words in `words`, from `start` to `end`.
    func piece(words: Range<Int>, start: Double, end: Double) -> Self
}

public struct SpeakerAttribution: Sendable {
    public struct Turn: Equatable, Sendable {
        public let speaker: Int
        public let start: Double
        public let end: Double
        public init(speaker: Int, start: Double, end: Double) {
            self.speaker = speaker; self.start = start; self.end = end
        }
    }

    public struct WordTime: Equatable, Sendable {
        public let start: Double
        public let end: Double
        public init(start: Double, end: Double) { self.start = start; self.end = end }
    }

    public struct Piece<Segment: SpeakerSegment> {
        public let segment: Segment
        /// The remote speaker, as the turns number them; nil only when there are no turns.
        public let speaker: Int?
        public init(segment: Segment, speaker: Int?) { self.segment = segment; self.speaker = speaker }
    }

    public init() {}

    /// The segments in order, each whole or split into pieces, each with its speaker.
    public func attribute<Segment: SpeakerSegment>(_ segments: [Segment], turns: [Turn]) -> [Piece<Segment>] {
        var durations: [Int: Double] = [:]
        for turn in turns { durations[turn.speaker, default: 0] += turn.end - turn.start }
        // Times are subtracted and summed, so a share of exactly 5 % can come out a
        // rounding error below it; the tolerance keeps such a speaker.
        let least = durations.values.reduce(0, +) * 0.05 * (1 - 1e-9)
        let kept = turns.filter { durations[$0.speaker, default: 0] >= least }
        let turns = kept.isEmpty ? turns : kept
        return segments.flatMap { attribute($0, turns: turns) }
    }

    private func attribute<Segment: SpeakerSegment>(_ segment: Segment, turns: [Turn]) -> [Piece<Segment>] {
        let words = segment.wordTimes
        let heard = words.map { overlapping(start: $0.start, end: $0.end, turns: turns) }
        guard var previous = heard.compactMap({ $0 }).first else {
            let speaker = overlapping(start: segment.start, end: segment.end, turns: turns)
                ?? nearest(start: segment.start, end: segment.end, turns: turns)
            return [Piece(segment: segment, speaker: speaker)]
        }
        let speakers = heard.map { speaker in
            previous = speaker ?? previous
            return previous
        }
        let boundaries = [0] + speakers.indices.dropFirst().filter { speakers[$0] != speakers[$0 - 1] } + [words.count]
        guard boundaries.count > 2 else { return [Piece(segment: segment, speaker: speakers[0])] }
        return zip(boundaries, boundaries.dropFirst()).map { lower, upper in
            Piece(
                segment: segment.piece(
                    words: lower..<upper,
                    start: lower == 0 ? segment.start : words[lower].start,
                    end: upper == words.count ? segment.end : words[upper].start
                ),
                speaker: speakers[lower]
            )
        }
    }

    private func overlapping(start: Double, end: Double, turns: [Turn]) -> Int? {
        var shares: [Int: (duration: Double, start: Double)] = [:]
        for turn in turns {
            let overlap = min(end, turn.end) - max(start, turn.start)
            guard overlap > 0 else { continue }
            let share = shares[turn.speaker]
            shares[turn.speaker] = ((share?.duration ?? 0) + overlap, min(share?.start ?? turn.start, turn.start))
        }
        return shares.min { lhs, rhs in
            if lhs.value.duration != rhs.value.duration { return lhs.value.duration > rhs.value.duration }
            if lhs.value.start != rhs.value.start { return lhs.value.start < rhs.value.start }
            return lhs.key < rhs.key
        }?.key
    }

    private func nearest(start: Double, end: Double, turns: [Turn]) -> Int? {
        turns.min { lhs, rhs in
            let left = max(0, max(start - lhs.end, lhs.start - end))
            let right = max(0, max(start - rhs.end, rhs.start - end))
            if left != right { return left < right }
            if lhs.start != rhs.start { return lhs.start < rhs.start }
            return lhs.speaker < rhs.speaker
        }?.speaker
    }
}

extension SpeakerAttribution.Piece: Equatable where Segment: Equatable {}
extension SpeakerAttribution.Piece: Sendable where Segment: Sendable {}
