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
        let (inputStream, inputContinuation) = AsyncStream.makeStream(of: String.self)
        let repl = REPL<String, ToolUseLoop.Event>(input: inputStream) { input in
            spinner.start()
            return AsyncStream { continuation in
                Task {
                    do {
                        for try await event in await agent.process(input) {
                            continuation.yield(event)
                        }
                    } catch {
                        spinner.stop()
                        print("error: \(error.localizedDescription)")
                    }
                    continuation.finish()
                }
            }
        }
        print("neris v\(Self.configuration.version)")
        Task {
            for await event in repl.run() {
                spinner.stop()
                switch event {
                case .text(let text): print(text)
                case .toolCall(let call): print("tool: \(call.name)")
                case .toolResult(let result): print("result: \(result)")
                }
            }
        }
        while true {
            print("neris> ", terminator: "")
            guard let line = readLine() else { break }
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty { continue }
            if ["exit", "quit", "q"].contains(trimmed.lowercased()) { break }
            inputContinuation.yield(trimmed)
        }
        inputContinuation.finish()
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
