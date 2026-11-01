public struct State: Equatable, Sendable {

    public enum Status: Equatable, Sendable {

        case off
        case fillingIn
        case listening
        case finished
        case failed(Failure)
    }

    public enum Failure: Equatable, Sendable {

        case fillingIn(String)
        case hearing(String)
        case finishing(String)
    }

    public struct Entry: Equatable, Sendable {

        public let text: Text
        /// The segment contains audio recovered after switching live text on.
        public let writtenLater: Bool
    }

    public internal(set) var status: Status
    public var finalCount: Int { finalEntries.count }
    /// Whole-call compatibility view; forming it joins the retained prefix and tail.
    public var entries: [Entry] { finalEntries + tailEntries }

    /// Immutable leading entries, retained across tail revisions.
    public internal(set) var finalEntries: [Entry] = []
    public internal(set) var tailEntries: [Entry]
    /// No text still to come starts before this.
    public internal(set) var noTextBefore: Double?

    init(status: Status, entries: [Entry]) {

        self.status = status
        tailEntries = entries
    }
}
