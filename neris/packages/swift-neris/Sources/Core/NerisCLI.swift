import ArgumentParser

public struct NerisCLI: AsyncParsableCommand {

    public init() {}

    public func run() async throws {
        try await LoopFactory().make().run()
    }
}

private extension LoopFactory {

    convenience init() {
        self.init(
            inputReader: { readLine() },
            filter: InputFilter().filter,
            processor: Agent().process
        )
    }
}
