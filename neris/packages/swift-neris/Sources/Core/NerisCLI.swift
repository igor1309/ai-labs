import ArgumentParser

public struct NerisCLI: AsyncParsableCommand {

    public init() {}

    public func run() async throws {
        let agent = Agent()
        try await agent.greet()
    }
}
