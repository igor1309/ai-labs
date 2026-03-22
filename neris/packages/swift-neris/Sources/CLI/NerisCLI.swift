import ArgumentParser
import Foundation
import NerisCore

@main
struct NerisCLI: AsyncParsableCommand {

    static let configuration = CommandConfiguration(version: "0.1.0")

    func run() async throws {

        guard let apiKey = ProcessInfo.processInfo.environment["OPENROUTER_API_KEY"] else {
            print("error: OPENROUTER_API_KEY not set")
            return
        }
        let agent = NerisAgent(config: .init(
            apiKey: apiKey,
            model: "nvidia/nemotron-3-super-120b-a12b:free"
        ))
        print("neris v\(Self.configuration.version)")
        for try await event in Loop(
            inputReader: { print("neris> ", terminator: ""); return readLine() },
            processor: { input in await agent.process(input) }
        ) {
            switch event {
            case .text(let text):
                print(text)
            case .toolCall(let call):
                print("tool: \(call.name)")
            case .toolResult(let result):
                print("result: \(result)")
            }
        }
    }
}
