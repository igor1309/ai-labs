public final class Loop<Element: Sendable>: AsyncSequence {

    typealias Reader = () async -> String?
    typealias Filter = (String) -> FilterResult
    typealias Processor = (String) async throws -> AsyncThrowingStream<Element, Error>

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

    public func makeAsyncIterator() -> Iterator {
        Iterator(reader: reader, filter: filter, processor: processor)
    }
}

extension Loop {

    public struct Iterator: AsyncIteratorProtocol {

        private let reader: Reader
        private let filter: Filter
        private let processor: Processor
        private var innerIterator: AsyncThrowingStream<Element, Error>.AsyncIterator?

        init(reader: @escaping Reader, filter: @escaping Filter, processor: @escaping Processor) {
            self.reader = reader
            self.filter = filter
            self.processor = processor
        }

        public mutating func next() async throws -> Element? {

            while true {
                if var inner = innerIterator {
                    if let element = try await inner.next() {
                        innerIterator = inner
                        return element
                    }
                    innerIterator = nil
                }

                guard let line = await reader() else { return nil }

                switch filter(line) {
                case .skip:
                    continue
                case .quit:
                    return nil
                case .input(let value):
                    let stream = try await processor(value)
                    innerIterator = stream.makeAsyncIterator()
                }
            }
        }
    }
}

public extension Loop where Element == String {

    convenience init(inputReader reader: @escaping () async -> String?) {
        let agent = Agent()
        self.init(
            inputReader: reader,
            filter: FilterResult.init,
            processor: { input in
                let result = try await agent.process(input)
                return AsyncThrowingStream { $0.yield(result); $0.finish() }
            }
        )
    }
}
