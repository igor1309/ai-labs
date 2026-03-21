import ArgumentParser
import NerisCore

@main
struct NerisCLI: AsyncParsableCommand {

    func run() async throws {
        let agent = Agent()
        try await agent.greet()
    }
}
