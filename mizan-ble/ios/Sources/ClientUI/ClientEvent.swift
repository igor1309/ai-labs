public enum ClientEvent: Equatable, Hashable, Sendable {
    case startHandshake
    case cancel
    case tryAgain
}
