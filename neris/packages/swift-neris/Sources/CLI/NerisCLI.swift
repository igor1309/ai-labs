import ArgumentParser
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
        self.init(inputReader: {
            print("neris> ", terminator: "")
            return readLine()
        })
    }
}
