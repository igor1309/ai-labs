import ArgumentParser
import Darwin
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
            model: "nvidia/nemotron-3-super-120b-a12b:free",
            systemPrompt: "You are neris, a helpful assistant. Be concise."
        ))
        let spinner = Spinner()
        let reader = { print("neris> ", terminator: ""); return readLine() }
        let processor = { (input: String) in
            spinner.start()
            return await agent.process(input)
        }
        print("neris v\(Self.configuration.version)")
        while true {
            do {
                for try await event in Loop(inputReader: reader, processor: processor) {
                    spinner.stop()
                    switch event {
                    case .text(let text):
                        print(text)
                    case .toolCall(let call):
                        print("tool: \(call.name)")
                    case .toolResult(let result):
                        print("result: \(result)")
                    }
                }
                break
            } catch {
                spinner.stop()
                print("error: \(error.localizedDescription)")
            }
        }
    }
}

private final class Spinner: @unchecked Sendable {

    private var active = false

    func start() {
        guard !active else { return }
        active = true
        print("thinking...", terminator: "")
        fflush(stdout)
    }

    func stop() {
        guard active else { return }
        active = false
        print("\r           \r", terminator: "")
        fflush(stdout)
    }
}
