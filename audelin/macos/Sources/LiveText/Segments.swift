/// A track's text so far, cut into segments at pauses.
public struct Segments: Equatable, Sendable {

    public struct Segment: Equatable, Identifiable, Sendable {

        public let id: Int
        /// Seconds into the track where the segment's first word starts.
        public var start: Double
        /// Words that will not change any more.
        public var settled: String
        /// Words the recogniser may still hear differently.
        public var pending: String
    }

    public enum Ending: Equatable, Sendable {

        /// The recogniser finished: no more segments come.
        case finished
        /// The recogniser failed: no more segments come.
        case failed
    }

    public private(set) var all: [Segment] = []
    public private(set) var ending: Ending?

    /// The silence between two words that starts a new segment.
    let pause: Double

    private var words: [Word] = []
    private var settledCount = 0

    public init(pause: Double) {

        self.pause = pause
    }

    mutating func hear(_ hearing: Hearing) {

        take(hearing)
        if let finalThrough = hearing.finalThrough {
            while settledCount < words.count, words[settledCount].end <= finalThrough {
                settledCount += 1
            }
        }
        cutIntoSegments()
    }

    mutating func finish(_ hearing: Hearing) {

        take(hearing)
        settledCount = words.count
        ending = .finished
        cutIntoSegments()
    }

    mutating func fail() {

        settledCount = words.count
        ending = .failed
        cutIntoSegments()
    }

    /// Replaces pending words from where the report starts; reported words
    /// over settled ones are dropped.
    private mutating func take(_ hearing: Hearing) {

        let settledEnd = settledCount > 0 ? words[settledCount - 1].end : -Double.infinity
        let reported = hearing.words.filter { $0.start >= settledEnd }
        guard let from = hearing.from ?? reported.first?.start else { return }

        let kept = words[settledCount...].prefix { $0.start < from }
        words = words[..<settledCount] + kept + reported
    }

    /// Cuts where a pause starts a word. Only the recogniser settles words,
    /// so a cut among settled words never changes, and a cut among pending
    /// words goes with them.
    private mutating func cutIntoSegments() {

        guard !words.isEmpty else { return all = [] }

        let cuts = words.indices.dropFirst().filter { words[$0].start - words[$0 - 1].end >= pause }
        let bounds = [0] + cuts + [words.count]
        all = zip(bounds, bounds.dropFirst()).enumerated().compactMap { id, bound in
            let (lower, upper) = bound
            guard lower < upper else { return nil }
            let settledUpper = min(max(settledCount, lower), upper)
            return Segment(
                id: id,
                start: words[lower].start,
                settled: text(words[lower..<settledUpper]),
                pending: text(words[settledUpper..<upper])
            )
        }
    }

    private func text(_ words: ArraySlice<Word>) -> String {

        words.map(\.text).joined(separator: " ")
    }
}
