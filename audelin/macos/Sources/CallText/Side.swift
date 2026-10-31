import SplitRows

/// One side owns hearing, filling in, switching and releasing its live text.
public protocol Side: Sendable {

    /// Delivers complete snapshots in order until this side ends.
    /// Final entries append in start order and never change. Subsequent entries cannot
    /// start before the end of the last final entry, even across switches.
    /// Cancellation ends the subscription, without stopping the side.
    func listen(_ receive: @escaping @Sendable (SideState) async -> Void) async
    func start(enabled: Bool) async
    func setEnabled(_ enabled: Bool) async
    func stop() async
}

public struct SideState: Equatable, Sendable {

    public enum Status: Equatable, Sendable {

        case off, gettingReady, listening, finished
        case failed(String)
    }

    public struct Entry: Equatable, Sendable {

        public let text: Text
        public let writtenLater: Bool

        public init(text: Text, writtenLater: Bool = false) {

            self.text = text
            self.writtenLater = writtenLater
        }
    }

    public let status: Status
    public let finalEntries: [Entry]
    public let tailEntries: [Entry]
    /// No text still to come starts before this. Nil when the side cannot say.
    public let noTextBefore: Double?
    public var entries: [Entry] { finalEntries + tailEntries }

    public init(status: Status, entries: [Entry]) {

        self.init(status: status, finalEntries: [], tailEntries: entries)
    }

    public init(status: Status, finalEntries: [Entry], tailEntries: [Entry], noTextBefore: Double? = nil) {

        self.status = status
        self.finalEntries = finalEntries
        self.tailEntries = tailEntries
        self.noTextBefore = noTextBefore
    }
}

/// A segment supplied by live text; call text does not cut speech itself.
public struct Text: Equatable, Sendable {

    public let id: Int
    public let start: Double
    public let end: Double
    public let settled: String
    public let pending: String

    public init(id: Int, start: Double, end: Double, settled: String = "", pending: String = "") {

        self.id = id
        self.start = start
        self.end = end
        self.settled = settled
        self.pending = pending
    }
}

public struct State: Equatable, Sendable {

    public enum Status: Equatable, Sendable {

        case off
        case gettingReady
        case listening
        case failed(String)
        case finished
    }

    public enum Speaker: Equatable, Sendable {

        case mine
        case theirs
    }

    public struct Entry: Equatable, Sendable {

        public let speaker: Speaker
        public let text: Text
        /// The segment contains speech recovered after switching text on.
        public let writtenLater: Bool
    }

    public internal(set) var status: Status
    /// The final entries stay sealed, so a new state shares them with earlier ones.
    public internal(set) var entries: SplitRows<Entry>
    /// Leading entries whose text and position in the call will not change.
    public internal(set) var finalCount: Int = 0
}
