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
            model: "nvidia/nemotron-3-super-120b-a12b:free"
        ))
        let spinner = Spinner()
        print("neris v\(Self.configuration.version)")
        for try await event in Loop(
            inputReader: { print("neris> ", terminator: ""); return readLine() },
            processor: { input in
                spinner.start()
                return await agent.process(input)
            }
        ) {
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
    }
}

private final class Spinner: @unchecked Sendable {

    private var task: Task<Void, Never>?
    private let frames = ["thinking.", "thinking..", "thinking..."]

    func start() {
        task = Task { [frames] in
            var index = 0
            while !Task.isCancelled {
                print("\r\(frames[index % frames.count])   ", terminator: "")
                fflush(stdout)
                index += 1
                try? await Task.sleep(for: .milliseconds(300))
            }
        }
    }

    func stop() {
        task?.cancel()
        task = nil
        print("\r\(String(repeating: " ", count: 20))\r", terminator: "")
        fflush(stdout)
    }
}
