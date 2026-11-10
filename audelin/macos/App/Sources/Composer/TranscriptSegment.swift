import protocol FillIn.Segment

/// One segment of a side's text: the content the transcript pipeline relays
/// from Live text to its readers. Live text cuts the segment; its end is the
/// next segment's start, or the end of what was heard for the last one.
struct TranscriptSegment: Equatable, Sendable {

    let id: Int
    let start: Double
    let end: Double
    let settled: String
    let pending: String

    init(id: Int, start: Double, end: Double, settled: String = "", pending: String = "") {

        self.id = id
        self.start = start
        self.end = end
        self.settled = settled
        self.pending = pending
    }
}

extension TranscriptSegment: FillIn.Segment {}
