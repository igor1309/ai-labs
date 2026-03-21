public final class LoopFactory {

    private let reader: Loop.Reader
    private let processor: Loop.Processor

    public init(
        inputReader reader: @escaping Loop.Reader,
        processor: @escaping Loop.Processor
    ) {
        self.reader = reader
        self.processor = processor
    }

    public func make() -> Loop {

        Loop(
            inputReader: reader,
            filter: InputFilter().filter,
            processor: processor
        )
    }
}
