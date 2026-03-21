import NerisCore
import Testing

final class LoopTests: TestContext {

    @Test func test_shouldCallProcessor_onValidInput() async throws {

        let (sut, _, processor) = makeSUT(
            input: ["hello"],
            filterResults: [.input("hello")]
        )

        try await sut.run()

        #expect(processor.payloads == ["hello"])
    }

    @Test func test_shouldSkipBlanks_andProcessValidInput() async throws {

        let (sut, _, processor) = makeSUT(
            input: ["", " ", "hello"],
            filterResults: [.skip, .skip, .input("hello")]
        )

        try await sut.run()

        #expect(processor.payloads == ["hello"])
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

        let (sut, _, processor) = makeSUT(
            input: ["hello", "q"],
            filterResults: [.input("hello"), .quit]
        )

        try await sut.run()

        #expect(processor.payloads == ["hello"])
    }

    @Test func test_shouldProcessMultipleInputs_beforeQuit() async throws {

        let (sut, _, processor) = makeSUT(
            input: ["", "hello", " ", "world", "exit"],
            filterResults: [.skip, .input("hello"), .skip, .input("world"), .quit]
        )

        try await sut.run()

        #expect(processor.payloads == ["hello", "world"])
    }

    // MARK: - Helpers

    private typealias SUT = Loop
    private typealias FilterSpy = CallSpy<String, FilterResult>
    private typealias ProcessorSpy = AsyncSpyOf<String, Void>

    private func makeSUT(
        input: [String],
        filterResults: [FilterResult],
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (SUT, FilterSpy, ProcessorSpy) {

        let filter = FilterSpy(stubs: filterResults)
        let processor = ProcessorSpy()
        let sut = SUT(inputReader: makeInput(input), filter: filter.call, processor: processor.call)
        trackForMemoryLeaks(sut, sourceLocation: sourceLocation)
        trackForMemoryLeaks(filter, sourceLocation: sourceLocation)
        trackForMemoryLeaks(processor, sourceLocation: sourceLocation)
        return (sut, filter, processor)
    }

    private func makeInput(_ lines: [String]) -> () async -> String? {
        var iterator = lines.makeIterator()
        return { iterator.next() }
    }
}
