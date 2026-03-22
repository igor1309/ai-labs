import ArgumentParser
import Darwin
import NerisCore

@main
struct NerisCLI: AsyncParsableCommand {

    static let configuration = CommandConfiguration(version: "0.1.0")

    func run() async throws {
        print("neris v\(Self.configuration.version)")
        for try await output in Loop() {
            print(output)
        }
    }
}

private extension Loop {

    convenience init() {
        let agent = Agent()
        self.init(
            inputReader: {
                print("neris> ", terminator: "")
                return readLine()
            },
            filter: FilterResult.init,
            processor: { input in
                let spinner = Spinner()
                spinner.start()
                defer { spinner.stop() }
                return try await agent.process(input)
            }
        )
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
