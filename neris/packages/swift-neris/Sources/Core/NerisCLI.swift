import ArgumentParser

public struct NerisCLI: AsyncParsableCommand {

    public init() {}

    public func run() async throws {
        try await Loop().run()
    }
}

private extension Loop {

    convenience init() {
        let agent = Agent()
        self.init(
            inputReader: { readLine() },
            filter: FilterResult.init,
            processor: agent.process
        )
    }
}
