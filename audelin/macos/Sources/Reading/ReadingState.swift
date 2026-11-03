import SplitRows

/// What one recording's panel shows, with no view or session dependencies.
public struct ReadingState: Equatable, Sendable {

    public enum Recording: Equatable, Sendable {

        case off
        case on(elapsed: String)
    }

    public enum Log: Equatable, Sendable {

        case empty
        case liveTextOff(kept: Lines?)
        case preparing(holds: [Held])
        case lines(Lines)
    }

    public enum Speaker: Hashable, Sendable {

        case mine, theirs
    }

    public struct Entry: Equatable, Identifiable, Sendable {

        public var id: Int
        public var time: String
        public var speaker: Speaker
        public var settled: String
        public var pending: String

        public init(id: Int, time: String, speaker: Speaker, settled: String = "", pending: String = "") {

            self.id = id
            self.time = time
            self.speaker = speaker
            self.settled = settled
            self.pending = pending
        }
    }

    public enum Row: Equatable, Sendable {

        case entry(Entry)
        case late(Late)
        case gap(Gap)
    }

    public struct Gap: Equatable, Sendable {

        public var speaker: Speaker
        public var time: String
        public var kind: ReadingProblem.Kind

        public init(speaker: Speaker, time: String, kind: ReadingProblem.Kind) {

            self.speaker = speaker
            self.time = time
            self.kind = kind
        }
    }

    public struct Banner: Equatable, Sendable {

        public var kind: ReadingProblem.Kind
        public var time: String

        public init(kind: ReadingProblem.Kind, time: String) {

            self.kind = kind
            self.time = time
        }
    }

    public struct Late: Equatable, Sendable {

        public var span: String
        public var entries: [Entry]

        public init(span: String, entries: [Entry]) {

            self.span = span
            self.entries = entries
        }
    }

    public struct Held: Equatable, Sendable {

        public var entryID: Entry.ID
        public var text: String

        public init(entryID: Entry.ID, text: String) {

            self.entryID = entryID
            self.text = text
        }
    }

    public struct Lines: Equatable, Sendable {

        public var rows: SplitRows<Row> = []
        /// Changes whenever `rows` is laid out again, so its sealed part may differ.
        public var layout = 0
        public var holds: [Held] = []
        public var newBelow = 0
        public var followsLive = true

        public static func == (lhs: Self, rhs: Self) -> Bool {

            lhs.newBelow == rhs.newBelow && lhs.followsLive == rhs.followsLive
                && lhs.holds == rhs.holds && lhs.rows == rhs.rows
        }

        public var entries: [Entry] {

            rows.flatMap { row -> [Entry] in
                switch row {
                case let .entry(entry): [entry]
                case let .late(group): group.entries
                case .gap: []
                }
            }
        }

        public init(
            rows: SplitRows<Row> = [], layout: Int = 0, holds: [Held] = [],
            newBelow: Int = 0, followsLive: Bool = true
        ) {

            self.rows = rows
            self.layout = layout
            self.holds = holds
            self.newBelow = newBelow
            self.followsLive = followsLive
        }
    }

    /// How many entries the lines hold, without walking them.
    public var entryCount: Int { text.count }

    public var banners: [Banner] = []

    public var recording: Recording = .off

    public var log: Log = .empty

    // Anchors keep revisions in place while an entry remains present.
    // Listening omissions retire them because producer ids can be reused.
    public struct Anchor: Equatable, Sendable {

        public var id: Int
        public var start: Double

        public init(id: Int, start: Double) {

            self.id = id
            self.start = start
        }
    }

    public var problems: [ReadingProblem] = []
    public var status: ReadingTextUpdate.Status = .off
    public var anchors: SplitDictionary<ReadingTextUpdate.Entry.ID, Anchor> = [:]
    public var nextDisplayID = 0
    public var text: SplitDictionary<ReadingTextUpdate.Entry.ID, ReadingTextUpdate.Entry> = [:]
    public var lines = Lines()

    public struct Rendered: Sendable {

        public struct Location: Equatable, Sendable {

            public var row: Int
            public var lateEntry: Int?

            public init(row: Int, lateEntry: Int? = nil) {

                self.row = row
                self.lateEntry = lateEntry
            }
        }

        public var prepared = false
        public var ordered: [ReadingTextUpdate.Entry.ID] = []
        /// Leading `ordered` entries that the sealed rows show.
        public var inSealedRows = 0
        public var entries: SplitDictionary<ReadingTextUpdate.Entry.ID, Entry> = [:]
        public var locations: SplitDictionary<ReadingTextUpdate.Entry.ID, Location> = [:]

        public init(
            prepared: Bool = false, ordered: [ReadingTextUpdate.Entry.ID] = [], inSealedRows: Int = 0,
            entries: SplitDictionary<ReadingTextUpdate.Entry.ID, Entry> = [:],
            locations: SplitDictionary<ReadingTextUpdate.Entry.ID, Location> = [:]
        ) {

            self.prepared = prepared
            self.ordered = ordered
            self.inSealedRows = inSealedRows
            self.entries = entries
            self.locations = locations
        }
    }

    // Per-reduction work stays local to the value and does not affect what the panel observes.
    public struct Work: Sendable {

        public var entryOrderComparisons = 0
        public var rowsBuilt = 0

        public init(entryOrderComparisons: Int = 0, rowsBuilt: Int = 0) {

            self.entryOrderComparisons = entryOrderComparisons
            self.rowsBuilt = rowsBuilt
        }
    }

    public var rendered = Rendered()
    public var work = Work()

    // Rendering indexes and work counts are derived bookkeeping, not panel state.
    public static func == (lhs: Self, rhs: Self) -> Bool {

        // More text being final is a change, and finding that out need not walk the call.
        lhs.text.sealed.count == rhs.text.sealed.count
            && lhs.banners == rhs.banners && lhs.recording == rhs.recording && lhs.problems == rhs.problems
            && lhs.status == rhs.status && lhs.anchors == rhs.anchors && lhs.nextDisplayID == rhs.nextDisplayID
            && lhs.text == rhs.text && lhs.lines == rhs.lines && lhs.log == rhs.log
    }

    public init(
        banners: [Banner] = [], recording: Recording = .off, log: Log = .empty,
        problems: [ReadingProblem] = [], status: ReadingTextUpdate.Status = .off,
        anchors: SplitDictionary<ReadingTextUpdate.Entry.ID, Anchor> = [:], nextDisplayID: Int = 0,
        text: SplitDictionary<ReadingTextUpdate.Entry.ID, ReadingTextUpdate.Entry> = [:],
        lines: Lines = .init(), rendered: Rendered = .init(), work: Work = .init()
    ) {

        self.banners = banners
        self.recording = recording
        self.log = log
        self.problems = problems
        self.status = status
        self.anchors = anchors
        self.nextDisplayID = nextDisplayID
        self.text = text
        self.lines = lines
        self.rendered = rendered
        self.work = work
    }
}
