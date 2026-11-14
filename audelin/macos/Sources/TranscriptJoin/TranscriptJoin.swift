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

    /// The parts' rows in time order, each moved by its part's start less the earliest
    /// start, so every row keeps its time of day. Parts with the same start keep the
    /// order they were given in; rows keep their order within a part.
    public static func join<Row: JoinRow>(_ parts: [Part<Row>]) -> [Row] {

        let ordered = parts.enumerated().sorted { ($0.element.start, $0.offset) < ($1.element.start, $1.offset) }.map(\.element)
        guard let earliest = ordered.first?.start else { return [] }
        return ordered.flatMap { part in
            let offset = part.start.timeIntervalSince(earliest)
            return part.rows.map { $0.moved(to: $0.time + offset) }
        }
    }
}
