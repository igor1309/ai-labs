final class Loop {

    typealias Reader = () async -> String?
    typealias Filter = (String) -> FilterResult
    typealias Processor = (String) async throws -> Void

    private let reader: Reader
    private let filter: Filter
    private let processor: Processor

    init(
        inputReader reader: @escaping Reader,
        filter: @escaping Filter,
        processor: @escaping Processor
    ) {
        self.reader = reader
        self.filter = filter
        self.processor = processor
    }

    func run() async throws {

        while let line = await reader() {
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
