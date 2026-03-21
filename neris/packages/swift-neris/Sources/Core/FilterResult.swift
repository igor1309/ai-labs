public enum FilterResult: Equatable, Sendable {
    case skip
    case quit
    case input(String)
}
