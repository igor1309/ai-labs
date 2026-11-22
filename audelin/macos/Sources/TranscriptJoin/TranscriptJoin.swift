import Foundation

/// What joining reads of a row: its time, in seconds from its part's start, and its
/// speaker key, if any; and how to move it to another time and key. Everything else a
/// row carries passes through unchanged.
public protocol JoinRow {
    var time: Double { get }
    var speaker: String? { get }
    func moved(to time: Double, speaker: String?) -> Self
}

/// What joining reads of a part's speaker: its key, and how to give it another. Its
/// name and anything else pass through unchanged.
public protocol JoinSpeaker {
    var key: String { get }
    func keyed(_ key: String) -> Self
}

/// Joins the transcripts of calls being merged into one, on the merged call's clock.
public enum TranscriptJoin {

    /// One call being merged: when it started, how long it lasted, its rows in order and
    /// its speakers.
    public struct Part<Row: JoinRow, Speaker: JoinSpeaker, Origin> {
        public let start: Date
        public let length: Double
        public let rows: [Row]
        public let speakers: [Speaker]
        public let originals: [Original<Origin>]
        public init(start: Date, length: Double, rows: [Row], speakers: [Speaker], originals: [Original<Origin>]) {
            self.start = start; self.length = length; self.rows = rows; self.speakers = speakers; self.originals = originals
        }
    }

    /// One original call's absolute start and a value joining never inspects.
    public struct Original<Origin> {
        public let start: Date
        public let origin: Origin
        public init(start: Date, origin: Origin) { self.start = start; self.origin = origin }
    }

    /// A joined row, or where the call was cut off between two parts.
    public enum Item<Row: JoinRow> {
        case row(Row)
        /// At the earlier part's end, lasting until the later part's start; no length
        /// when the parts overlap.
        case gap(at: Double, length: Double)
    }

    /// The joined call: its items, and every part's speakers under keys of their part.
    public struct Joined<Row: JoinRow, Speaker: JoinSpeaker, Origin> {
        public let items: [Item<Row>]
        public let speakers: [Speaker]
        public let originals: [Original<Origin>]
    }

    /// The parts' rows in time order, each moved by its part's start less the earliest
    /// start, so every row keeps its time of day, with a gap between each two parts.
    /// Parts with the same start keep the order they were given in; rows keep their
    /// order within a part. Each part's speaker keys, on its rows and its speakers, are
    /// given a key of that part, `N.key` for the Nth part in time order, so the same key
    /// in two parts is two speakers.
    public static func join<Row, Speaker, Origin>(_ parts: [Part<Row, Speaker, Origin>]) -> Joined<Row, Speaker, Origin> {

        let ordered = parts.enumerated().sorted { ($0.element.start, $0.offset) < ($1.element.start, $1.offset) }.map(\.element)
        guard let earliest = ordered.first?.start else { return Joined(items: [], speakers: [], originals: []) }
        var items: [Item<Row>] = []
        var speakers: [Speaker] = []
        for (index, part) in ordered.enumerated() {
            let offset = part.start.timeIntervalSince(earliest)
            if index > 0 {
                let previous = ordered[index - 1]
                let end = previous.start.timeIntervalSince(earliest) + previous.length
                items.append(.gap(at: end, length: max(offset - end, 0)))
            }
            let key = { (speaker: String) in "\(index + 1).\(speaker)" }
            items += part.rows.map { .row($0.moved(to: $0.time + offset, speaker: $0.speaker.map(key))) }
            speakers += part.speakers.map { $0.keyed(key($0.key)) }
        }
        let originals = ordered.flatMap(\.originals).enumerated()
            .sorted { ($0.element.start, $0.offset) < ($1.element.start, $1.offset) }.map(\.element)
        return Joined(items: items, speakers: speakers, originals: originals)
    }
}
