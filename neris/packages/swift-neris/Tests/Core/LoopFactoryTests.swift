import NerisCore
import Testing

final class LoopFactoryTests: TestContext {

    @Test func test_shouldCallProcessor_whenLoopRuns() async throws {

        let (sut, processor) = makeSUT(input: ["hello", "q"])

        try await makeLoop(sut).run()

        #expect(processor.payloads == ["hello"])
    }

    // MARK: - Helpers

    private typealias SUT = LoopFactory
    private typealias ReaderSpy = CallSpy<Void, String?>
    private typealias ProcessorSpy = AsyncSpyOf<String, Void>

    private func makeSUT(
        input: [String],
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (SUT, ProcessorSpy) {

        let reader = ReaderSpy(stubs: input + [nil])
        let processor = ProcessorSpy()
        let sut = SUT(
            inputReader: { reader.call() },
            processor: processor.call
        )
        trackForMemoryLeaks(sut, sourceLocation: sourceLocation)
        trackForMemoryLeaks(reader, sourceLocation: sourceLocation)
        trackForMemoryLeaks(processor, sourceLocation: sourceLocation)
        return (sut, processor)
    }

    private func makeLoop(_ factory: SUT, _ sourceLocation: SourceLocation = #_sourceLocation) -> Loop {

        let loop = factory.make()
        trackForMemoryLeaks(loop, sourceLocation: sourceLocation)
        return loop
    }
}
