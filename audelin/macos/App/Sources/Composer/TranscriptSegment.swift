import struct LiveText.Word
import protocol CallText.Segment
import struct CallText.State
import protocol FillIn.Segment
import protocol SideText.Segment

/// One segment of a side's text: the content the transcript pipeline relays
/// from Live text to its readers. Live text cuts the segment; its end is the
/// next segment's start, or the end of what was heard for the last one.
public struct TranscriptSegment: Equatable, Sendable {

    public let id: Int
    public let start: Double
    public let end: Double
    public let words: [Word]
    /// How many words, from the first, are settled.
    public let settledCount: Int

    public init(id: Int, start: Double, end: Double, words: [Word], settledCount: Int) {

        self.id = id
        self.start = start
        self.end = end
        self.words = words
        self.settledCount = settledCount
    }
}

extension TranscriptSegment: FillIn.Segment {}

extension TranscriptSegment: CallText.Segment {}

extension TranscriptSegment: SideText.Segment {

    public func identified(as id: Int) -> TranscriptSegment {

        TranscriptSegment(id: id, start: start, end: end, words: words, settledCount: settledCount)
    }
}

/// The call's text as call text merges it from the two sides.
public typealias CallState = CallText.State<TranscriptSegment>

extension TranscriptSegment {

    /// The settled words as readers show them: joined with single spaces.
    var settledText: String { words.prefix(settledCount).map(\.text).joined(separator: " ") }

    /// The pending words as readers show them: joined with single spaces.
    var pendingText: String { words.dropFirst(settledCount).map(\.text).joined(separator: " ") }
}
