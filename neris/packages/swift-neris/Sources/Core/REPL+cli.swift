import Foundation

public extension REPL where Input == String {

    static func cli(
        reader: @escaping @Sendable () async -> String?,
        turn: @escaping @Sendable (Input) -> AsyncStream<Event>
    ) -> REPL {
        let input = AsyncStream<String> {
            while let raw = await reader() {
                let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
                if trimmed.isEmpty { continue }
                if ["exit", "quit", "q"].contains(trimmed.lowercased()) { return nil }
                return trimmed
            }
            return nil
        }
        return REPL(input: input, turn: turn)
    }
}
