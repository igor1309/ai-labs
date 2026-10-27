public enum ClientEvent: Equatable, Sendable {
    case startHandshake
    case cancel
    case tryAgain
}
