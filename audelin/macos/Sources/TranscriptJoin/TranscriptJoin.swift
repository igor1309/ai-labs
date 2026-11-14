import Foundation

/// What joining reads of a row: its time, in seconds from its part's start, and how to
/// move it to another time. Everything else a row carries passes through unchanged.
public protocol JoinRow {
    var time: Double { get }
    func moved(to time: Double) -> Self
}

/// Joins the transcripts of calls being merged into one, on the merged call's clock.
public enum TranscriptJoin {

    /// One call being merged: when it started, how long it lasted, and its rows in order.
    public struct Part<Row: JoinRow> {
        public let start: Date
        public let length: Double
        public let rows: [Row]
        public init(start: Date, length: Double, rows: [Row]) { self.start = start; self.length = length; self.rows = rows }
    }

    /// A joined row, or where the call was cut off between two parts.
    public enum Item<Row: JoinRow> {
        case row(Row)
        /// At the earlier part's end, lasting until the later part's start; no length
        /// when the parts overlap.
        case gap(at: Double, length: Double)
    }

    /// The parts' rows in time order, each moved by its part's start less the earliest
    /// start, so every row keeps its time of day, with a gap between each two parts.
    /// Parts with the same start keep the order they were given in; rows keep their
    /// order within a part.
    public static func join<Row: JoinRow>(_ parts: [Part<Row>]) -> [Item<Row>] {

        let ordered = parts.enumerated().sorted { ($0.element.start, $0.offset) < ($1.element.start, $1.offset) }.map(\.element)
        guard let earliest = ordered.first?.start else { return [] }
        var items: [Item<Row>] = []
        for (index, part) in ordered.enumerated() {
            let offset = part.start.timeIntervalSince(earliest)
            if index > 0 {
                let previous = ordered[index - 1]
                let end = previous.start.timeIntervalSince(earliest) + previous.length
                items.append(.gap(at: end, length: max(offset - end, 0)))
            }
            items += part.rows.map { .row($0.moved(to: $0.time + offset)) }
        }
        return items
    }
}
