/// What one recording's panel shows, with no view or session dependencies.
public struct ReadingState: Equatable, Sendable {

    public enum Recording: Equatable, Sendable {

        case off
        case on(elapsed: String)
    }

    public enum Log: Equatable, Sendable {

        case empty
        case liveTextOff(kept: Lines?)
        case preparing
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

            rows.flatMap { row in
                switch row {
                case let .entry(entry): [entry]
                case let .late(group): group.entries
                }
            }
        }
    }

    public internal(set) var recording: Recording = .off

    public var log: Log {

        switch status {
        case .off:
            let kept = lines.rows.isEmpty && lines.holds.isEmpty ? nil : lines
            return recording == .off ? kept.map(Log.lines) ?? .empty : .liveTextOff(kept: kept)
        case .gettingReady:
            return .preparing
        case .listening, .failed, .finished:
            return .lines(lines)
        }
    }

    // Anchors outlive snapshots: settling and temporary omissions must not
    // give an entry another identity, position, or new-below count.
    struct Anchor: Equatable, Sendable {

        let id: Int
        let start: Double
    }

    var status: ReadingTextUpdate.Status = .off
    var anchors: [ReadingTextUpdate.Entry.ID: Anchor] = [:]
    var text: [ReadingTextUpdate.Entry.ID: ReadingTextUpdate.Entry] = [:]
    var lines = Lines()

    public init() {}
}
