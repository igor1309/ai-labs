import ArgumentParser

public struct NerisCLI: AsyncParsableCommand {

    public init() {}

    public func run() async throws {
        let filter = InputFilter()
        let agent = Agent()
        let loop = Loop(
            inputReader: { readLine() },
            filter: filter.filter,
            processor: agent.process
        )
        try await loop.run()
    }
}
