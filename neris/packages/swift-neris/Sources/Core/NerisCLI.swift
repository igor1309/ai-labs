import ArgumentParser

public struct NerisCLI: AsyncParsableCommand {

    public init() {}

    public func run() async throws {
        let agent = Agent()
        let loop = Loop(
            inputReader: { readLine() },
            filter: FilterResult.init,
            processor: agent.process
        )
        try await loop.run()
    }
}
