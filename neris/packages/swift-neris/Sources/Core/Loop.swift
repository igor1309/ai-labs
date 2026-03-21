public final class Loop {

    private let input: () async -> String?
    private let filter: InputFiltering
    private let processor: (String) async throws -> Void

    public init(
        input: @escaping () async -> String?,
        filter: @escaping InputFiltering,
        processor: @escaping (String) async throws -> Void
    ) {
        self.input = input
        self.filter = filter
        self.processor = processor
    }

    public func run() async throws {

        while let line = await input() {
            switch filter(line) {
            case .skip:
                continue
            case .quit:
                return
            case .input(let value):
                try await processor(value)
            }
        }
    }
}
