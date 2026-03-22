public final class Loop: AsyncSequence {

    public typealias Element = String

    public typealias Reader = () async -> String?
    public typealias Filter = (String) -> FilterResult
    public typealias Processor = (String) async throws -> String

    private let reader: Reader
    private let filter: Filter
    private let processor: Processor

    public init(
        inputReader reader: @escaping Reader,
        filter: @escaping Filter,
        processor: @escaping Processor
    ) {
        self.reader = reader
        self.filter = filter
        self.processor = processor
    }

    public func makeAsyncIterator() -> Iterator {
        Iterator(reader: reader, filter: filter, processor: processor)
    }
}

extension Loop {

    public struct Iterator: AsyncIteratorProtocol {

        private let reader: Reader
        private let filter: Filter
        private let processor: Processor

        init(reader: @escaping Reader, filter: @escaping Filter, processor: @escaping Processor) {
            self.reader = reader
            self.filter = filter
            self.processor = processor
        }

        public mutating func next() async throws -> String? {

            while let line = await reader() {
                switch filter(line) {
                case .skip:
                    continue
                case .quit:
                    return nil
                case .input(let value):
                    return try await processor(value)
                }
            }
            return nil
        }
    }
}

public extension Loop {

    convenience init(inputReader reader: @escaping () async -> String?) {
        let agent = Agent()
        self.init(
            inputReader: reader,
            filter: FilterResult.init,
            processor: agent.process
        )
    }
}
