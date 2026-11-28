import Foundation

public protocol SplitRow {
    /// Seconds from the transcript's start.
    var time: Double { get }
    var speaker: String? { get }
    func moved(to time: Double) -> Self
}

public protocol SplitSpeaker {
    var key: String { get }
}

/// Partitions a transcript and plans the corresponding ranges of original recordings.
public enum TranscriptSplit {

    public struct Original<Origin> {
        public let start: Date
        public let length: Double
        public let origin: Origin

        public init(start: Date, length: Double, origin: Origin) {
            self.start = start
            self.length = length
            self.origin = origin
        }
    }

    public struct RecordingRange<Origin> {
        public let original: Original<Origin>
        /// Absolute start of this excerpt, independent of the containing transcript's start.
        public let start: Date
        /// Seconds into the original recording where this excerpt begins.
        public let sourceOffset: Double
        public let length: Double
    }

    public struct Part<Row: SplitRow, Speaker: SplitSpeaker, Origin> {
        public let timelineStart: Date
        public let rows: [Row]
        public let speakers: [Speaker]
        public let recordings: [RecordingRange<Origin>]
    }

    /// Rows at `cut` belong to the second part. The caller supplies a cut in whole
    /// seconds from `timelineStart`, and the lengths of the original recordings.
    public static func split<Row: SplitRow, Speaker: SplitSpeaker, Origin>(
        timelineStart: Date, at cut: Int, rows: [Row], speakers: [Speaker], originals: [Original<Origin>]
    ) -> (before: Part<Row, Speaker, Origin>, after: Part<Row, Speaker, Origin>) {
        let time = Double(cut)
        let cutDate = timelineStart.addingTimeInterval(time)
        var beforeRows: [Row] = [], afterRows: [Row] = []
        for row in rows {
            if row.time < time { beforeRows.append(row) }
            else { afterRows.append(row.moved(to: row.time - time)) }
        }

        var beforeRecordings: [RecordingRange<Origin>] = [], afterRecordings: [RecordingRange<Origin>] = []
        for original in originals {
            let offset = cutDate.timeIntervalSince(original.start)
            if offset <= 0 {
                afterRecordings.append(.init(original: original, start: original.start, sourceOffset: 0, length: original.length))
            } else {
                beforeRecordings.append(.init(original: original, start: original.start, sourceOffset: 0,
                                              length: min(original.length, offset)))
                if offset < original.length {
                    afterRecordings.append(.init(original: original, start: cutDate, sourceOffset: offset,
                                                 length: original.length - offset))
                }
            }
        }

        let beforeKeys = Set(beforeRows.compactMap(\.speaker)), afterKeys = Set(afterRows.compactMap(\.speaker))
        return (Part(timelineStart: timelineStart, rows: beforeRows, speakers: speakers.filter { beforeKeys.contains($0.key) },
                     recordings: beforeRecordings),
                Part(timelineStart: cutDate, rows: afterRows, speakers: speakers.filter { afterKeys.contains($0.key) },
                     recordings: afterRecordings))
    }
}
