import Foundation

public final class InputFilter {

    public init() {}

    public func filter(_ input: String) -> Result {
        let trimmed = input.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { return .skip }
        if ["exit", "quit", "q"].contains(trimmed) { return .quit }
        return .input(trimmed)
    }
}

extension InputFilter {

    public enum Result: Equatable, Sendable {
        case skip
        case quit
        case input(String)
    }
}
