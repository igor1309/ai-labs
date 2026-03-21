import ArgumentParser
import NerisCore

struct NerisCLI: AsyncParsableCommand {

    func run() async throws {
        try await Loop().run()
    }
}

private extension Loop {

    convenience init() {
        self.init(inputReader: { readLine() })
    }
}
