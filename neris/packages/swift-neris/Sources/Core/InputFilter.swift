import Foundation

public enum FilterResult: Equatable, Sendable {
    case skip
    case quit
    case input(String)
}

public typealias InputFiltering = (String) -> FilterResult

public final class InputFilter {

    public init() {}

    public func filter(_ input: String) -> FilterResult {

        let trimmed = input.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { return .skip }
        if ["exit", "quit", "q"].contains(trimmed) { return .quit }
        return .input(trimmed)
    }
}
