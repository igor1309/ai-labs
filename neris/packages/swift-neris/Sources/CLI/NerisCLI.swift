import ArgumentParser
import NerisCore

@main
struct NerisCLI: AsyncParsableCommand {

    func run() async throws {
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
