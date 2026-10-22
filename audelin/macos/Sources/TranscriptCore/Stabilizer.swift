import Foundation

/// A recognised word, in the session clock.
public struct Word: Equatable, Sendable {
    public var text: String
    public var start: TimeInterval
    public var end: TimeInterval
    public var confidence: Double

    public init(text: String, start: TimeInterval, end: TimeInterval, confidence: Double = 1) {
        self.text = text
        self.start = start
        self.end = end
        self.confidence = confidence
    }

    var middle: TimeInterval { (start + end) / 2 }
}

/// One recognition window: audio from `start` to `end`, decoded once.
/// The window cutter marks where its right context begins.
public struct RecognitionWindow: Equatable, Sendable {
    public var start: TimeInterval
    public var end: TimeInterval
    public var rightContextFrom: TimeInterval
    public var words: [Word]
    /// The epoch's final window: its whole reading is final.
    public var isEpochEnd: Bool

    public init(
        start: TimeInterval, end: TimeInterval, rightContextFrom: TimeInterval,
        words: [Word], isEpochEnd: Bool = false
    ) {
        self.start = start
        self.end = end
        self.rightContextFrom = rightContextFrom
        self.words = words
        self.isEpochEnd = isEpochEnd
    }
}

/// Committed text: final, never revised.
public struct Segment: Equatable, Sendable {
    public var epoch: Int
    public var words: [Word]

    public var start: TimeInterval { words.first?.start ?? 0 }
    public var end: TimeInterval { words.last?.end ?? 0 }
    public var text: String { words.map(\.text).joined(separator: " ") }
}

/// Turns one track's recognition windows into committed segments and a live
/// tail, for one epoch and one attempt (ADR-001 decisions 4 and 7).
public struct Stabilizer: Sendable {
    public let epoch: Int
    /// Audio time up to which everything is committed or known silent.
    public private(set) var watermark: TimeInterval
    /// Text not yet committed, in time order.
    public private(set) var tail: [Word] = []
    public private(set) var isFinished = false
    /// The last committed words, matched against re-read words.
    private var recent: [Word]

    /// A new attempt starts from the track's watermark and the words last
    /// committed before it.
    public init(epoch: Int, watermark: TimeInterval = 0, lastCommitted: [Word] = []) {
        self.epoch = epoch
        self.watermark = watermark
        self.recent = Array(lastCommitted.suffix(Self.recentCount))
    }

    private static let recentCount = 8

    public mutating func feed(_ window: RecognitionWindow) -> Segment? {
        guard !isFinished else { return nil }

        // Windows only move forward: a tail word that starts before this
        // window can never be read again, so its reading is final.
        let passed = tail.filter { $0.start < window.start }
        let reading = window.words.filter { !isCommitted($0) }
        let settled = { (word: Word) in
            window.isEpochEnd || word.end <= window.rightContextFrom
        }

        var committed = passed
        var live: [Word] = []
        for word in reading {
            if live.isEmpty && settled(word) {
                committed.append(word)
            } else {
                live.append(word)
            }
        }
        tail = live

        if let first = tail.first {
            if let last = committed.last {
                let gap = last.end < first.start ? (last.end + first.start) / 2 : first.start
                watermark = max(watermark, gap)
            }
        } else {
            let accounted = window.isEpochEnd ? window.end : window.rightContextFrom
            watermark = max(watermark, accounted, committed.last?.end ?? 0)
        }
        isFinished = window.isEpochEnd

        guard !committed.isEmpty else { return nil }
        recent = Array((recent + committed).suffix(Self.recentCount))
        return Segment(epoch: epoch, words: committed)
    }

    /// A window that failed to decode changes nothing: the tail waits for
    /// the next window.
    public mutating func windowFailed() {}

    /// A re-read word that lies before the watermark, or repeats a word
    /// committed at the same time.
    private func isCommitted(_ word: Word) -> Bool {
        if word.middle < watermark { return true }
        let key = Self.normalized(word.text)
        return recent.contains {
            $0.start < word.end && word.start < $0.end && Self.normalized($0.text) == key
        }
    }

    static func normalized(_ text: String) -> String {
        text.lowercased().filter { $0.isLetter || $0.isNumber }
    }
}
