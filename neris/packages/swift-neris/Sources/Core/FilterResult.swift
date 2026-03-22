import Foundation

enum FilterResult: Equatable, Sendable {
    case skip
    case quit
    case input(String)
}

extension FilterResult {

    init(_ rawInput: String) {
        let trimmed = rawInput.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            self = .skip
        } else if ["exit", "quit", "q"].contains(trimmed.lowercased()) {
            self = .quit
        } else {
            self = .input(trimmed)
        }
    }
}
