import NerisCore
import Testing

final class LoopTests: TestContext {

    @Test func test_shouldCallProcessor_onValidInput() async throws {

        let input = makeSomeString()
        let (sut, _, processor) = makeSUT(
            input: [input],
            filterResults: [.input(input)]
        )

        try await sut.run()

        #expect(processor.payloads == [input])
    }

    @Test func test_shouldSkipBlanks_andProcessValidInput() async throws {

        let input = makeSomeString()
        let (sut, _, processor) = makeSUT(
            input: [makeSomeString(), makeSomeString(), input],
            filterResults: [.skip, .skip, .input(input)]
        )

        try await sut.run()

        #expect(processor.payloads == [input])
    }

    @Test func test_shouldNotCallProcessor_onQuitInput() async throws {

        let (sut, _, processor) = makeSUT(
            input: ["q"],
            filterResults: [.quit]
        )

        try await sut.run()

        #expect(processor.payloads.isEmpty)
    }

    @Test func test_shouldStopProcessing_afterQuit() async throws {

        let input = makeSomeString()
        let (sut, _, processor) = makeSUT(
            input: [input, makeSomeString()],
            filterResults: [.input(input), .quit]
        )

        try await sut.run()

        #expect(processor.payloads == [input])
    }

    @Test func test_shouldProcessMultipleInputs_beforeQuit() async throws {

        let first = makeSomeString()
        let second = makeSomeString()
        let (sut, _, processor) = makeSUT(
            input: [makeSomeString(), first, makeSomeString(), second, makeSomeString()],
            filterResults: [.skip, .input(first), .skip, .input(second), .quit]
        )

        try await sut.run()

        #expect(processor.payloads == [first, second])
    }

    @Test func test_shouldPassReaderOutputToFilter() async throws {

        let input = makeSomeString()
        let (sut, filter, _) = makeSUT(
            input: [input],
            filterResults: [.quit]
        )

        try await sut.run()

        #expect(filter.payloads == [input])
    }

    @Test func test_shouldPassFilterOutputToProcessor() async throws {

        let filtered = makeSomeString()
        let (sut, _, processor) = makeSUT(
            input: [makeSomeString()],
            filterResults: [.input(filtered), .quit]
        )

        try await sut.run()

        #expect(processor.payloads == [filtered])
    }

    // MARK: - Helpers

    private typealias SUT = Loop
    private typealias ReaderSpy = CallSpy<Void, String?>
    private typealias FilterSpy = CallSpy<String, FilterResult>
    private typealias ProcessorSpy = AsyncSpyOf<String, Void>

    private func makeSUT(
        input: [String],
        filterResults: [FilterResult],
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (SUT, FilterSpy, ProcessorSpy) {

        let reader = ReaderSpy(stubs: input + [nil])
        let filter = FilterSpy(stubs: filterResults)
        let processor = ProcessorSpy()
        let sut = SUT(inputReader: { reader.call() }, filter: filter.call, processor: processor.call)
        trackForMemoryLeaks(sut, sourceLocation: sourceLocation)
        trackForMemoryLeaks(reader, sourceLocation: sourceLocation)
        trackForMemoryLeaks(filter, sourceLocation: sourceLocation)
        trackForMemoryLeaks(processor, sourceLocation: sourceLocation)
        return (sut, filter, processor)
    }
}
