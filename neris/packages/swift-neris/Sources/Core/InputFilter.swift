import Foundation

final class InputFilter {

    init() {}

    func filter(_ input: String) -> FilterResult {

        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return .skip }
        if ["exit", "quit", "q"].contains(trimmed.lowercased()) { return .quit }
        return .input(trimmed)
    }
}
