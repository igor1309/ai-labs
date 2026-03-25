public extension REPL where Input == String {

    static func cli(
        reader: @escaping @Sendable () async -> String?,
        turn: @escaping @Sendable (Input) -> AsyncStream<Event>
    ) -> REPL {
        let input = AsyncStream<String> {
            while let raw = await reader() {
                switch FilterResult(raw) {
                case .skip: continue
                case .quit: return nil
                case .input(let value): return value
                }
            }
            return nil
        }
        return REPL(input: input, turn: turn)
    }
}
