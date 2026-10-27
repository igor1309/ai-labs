public enum ClientPaymentEvent: Equatable, Sendable {
    case confirm
    case decline
    case done
}
