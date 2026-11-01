public struct State: Equatable, Sendable {

    public enum Status: Equatable, Sendable {

        case idle
        case gettingReady
        case catchingUp
        case finished
        case failed(Failure)
    }

    public enum Failure: Equatable, Sendable {

        case gettingReady(String)
        case reading(String)
        case hearing(String)
    }

    public struct Entry: Equatable, Sendable {

        public let text: Text
        /// The segment contains audio missed before switching live text on.
        public let writtenLater: Bool
    }

    public internal(set) var status: Status
    public internal(set) var entries: [Entry]
    /// End of audio successfully heard before this operation ended.
    public internal(set) var heardThrough: Double
}
