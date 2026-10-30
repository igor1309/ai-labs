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

        public let id: Int
        public let time: String
        public let speaker: Speaker
        public let settled: String
        public let pending: String
    }

    public enum Row: Equatable, Sendable {

        case entry(Entry)
        case late(Late)
        case gap(Gap)
    }

    public struct Gap: Equatable, Sendable {

        public let speaker: Speaker
        public let time: String
        public let kind: ReadingProblem.Kind
    }

    public struct Banner: Equatable, Sendable {

        public let kind: ReadingProblem.Kind
        public let time: String
    }

    public struct Late: Equatable, Sendable {

        public let span: String
        public let entries: [Entry]
    }

    public struct Held: Equatable, Sendable {

        public let entryID: Entry.ID
        public let text: String

        public init(entryID: Entry.ID, text: String) {

            self.entryID = entryID
            self.text = text
        }
    }

    public struct Lines: Equatable, Sendable {

        public internal(set) var rows: [Row] = []
        public internal(set) var holds: [Held] = []
        public internal(set) var newBelow = 0
        public internal(set) var followsLive = true

        public var entries: [Entry] {

            rows.flatMap { row -> [Entry] in
                switch row {
                case let .entry(entry): [entry]
                case let .late(group): group.entries
                case .gap: []
                }
            }
        }
    }

    public internal(set) var banners: [Banner] = []

    public internal(set) var recording: Recording = .off

    public var log: Log {

        switch status {
        case .off:
            let kept = lines.rows.isEmpty && lines.holds.isEmpty ? nil : lines
            return recording == .off ? kept.map(Log.lines) ?? .empty : .liveTextOff(kept: kept)
        case .gettingReady:
            if !banners.isEmpty { return .lines(lines) }
            return .preparing(holds: lines.holds)
        case .listening, .failed, .finished:
            return .lines(lines)
        }
    }

    // Anchors keep revisions in place while an entry remains present.
    // Listening omissions retire them because producer ids can be reused.
    struct Anchor: Equatable, Sendable {

        let id: Int
        let start: Double
    }

    var problems: [ReadingProblem] = []
    var status: ReadingTextUpdate.Status = .off
    var anchors: [ReadingTextUpdate.Entry.ID: Anchor] = [:]
    var nextDisplayID = 0
    var text: [ReadingTextUpdate.Entry.ID: ReadingTextUpdate.Entry] = [:]
    var lines = Lines()

    struct Rendered: Sendable {

        struct Location: Sendable {

            let row: Int
            let lateEntry: Int?
        }

        var prepared = false
        var ordered: [ReadingTextUpdate.Entry.ID] = []
        var entries: [ReadingTextUpdate.Entry.ID: Entry] = [:]
        var locations: [ReadingTextUpdate.Entry.ID: Location] = [:]
    }

    // Per-reduction work stays local to the value and does not affect what the panel observes.
    struct Work: Sendable {

        var entryOrderComparisons = 0
        var rowsBuilt = 0
    }

    var rendered = Rendered()
    var work = Work()

    // Rendering indexes and work counts are derived bookkeeping, not panel state.
    public static func == (lhs: Self, rhs: Self) -> Bool {

        lhs.banners == rhs.banners && lhs.recording == rhs.recording && lhs.problems == rhs.problems
            && lhs.status == rhs.status && lhs.anchors == rhs.anchors && lhs.nextDisplayID == rhs.nextDisplayID
            && lhs.text == rhs.text && lhs.lines == rhs.lines
    }

    public init() {}
}
