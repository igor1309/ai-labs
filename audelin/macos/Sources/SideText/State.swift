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
    public internal(set) var entries: [Entry]
}
