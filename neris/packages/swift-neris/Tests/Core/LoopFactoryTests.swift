import NerisCore
import Testing

final class LoopFactoryTests: TestContext {

    @Test func test_shouldWireReaderToFilter() async throws {

        let input = makeSomeString()
        let (sut, filter, _) = makeSUT(input: [input])

        try await makeLoop(sut).run()

        #expect(filter.payloads == [input])
    }

    @Test func test_shouldWireFilterToProcessor() async throws {

        let filtered = makeSomeString()
        let (sut, _, processor) = makeSUT(
            input: [makeSomeString()],
            filterResults: [.input(filtered)]
        )

        try await makeLoop(sut).run()

        #expect(processor.payloads == [filtered])
    }

    // MARK: - Helpers

    private typealias SUT = LoopFactory
    private typealias ReaderSpy = CallSpy<Void, String?>
    private typealias FilterSpy = CallSpy<String, FilterResult>
    private typealias ProcessorSpy = AsyncSpyOf<String, Void>

    private func makeSUT(
        input: [String],
        filterResults: [FilterResult] = [.quit],
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (SUT, FilterSpy, ProcessorSpy) {

        let reader = ReaderSpy(stubs: input + [nil])
        let filter = FilterSpy(stubs: filterResults + [.quit])
        let processor = ProcessorSpy()
        let sut = SUT(
            inputReader: { reader.call() },
            filter: filter.call,
            processor: processor.call
        )
        trackForMemoryLeaks(sut, sourceLocation: sourceLocation)
        trackForMemoryLeaks(reader, sourceLocation: sourceLocation)
        trackForMemoryLeaks(filter, sourceLocation: sourceLocation)
        trackForMemoryLeaks(processor, sourceLocation: sourceLocation)
        return (sut, filter, processor)
    }

    private func makeLoop(_ factory: SUT, _ sourceLocation: SourceLocation = #_sourceLocation) -> Loop {

        let loop = factory.make()
        trackForMemoryLeaks(loop, sourceLocation: sourceLocation)
        return loop
    }
}
