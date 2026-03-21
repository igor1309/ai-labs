public final class LoopFactory {

    private let reader: Loop.Reader
    private let filter: Loop.Filter
    private let processor: Loop.Processor

    public init(
        inputReader reader: @escaping Loop.Reader,
        filter: @escaping Loop.Filter,
        processor: @escaping Loop.Processor
    ) {
        self.reader = reader
        self.filter = filter
        self.processor = processor
    }

    public func make() -> Loop {

        Loop(
            inputReader: reader,
            filter: filter,
            processor: processor
        )
    }
}
