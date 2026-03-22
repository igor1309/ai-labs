@testable import NerisCore
import Testing

final class LoopTests: TestContext {

    @Test func test_shouldYieldProcessorOutput() async throws {

        let input = makeSomeString()
        let output = makeSomeString()
        let (sut, _, _) = makeSUT(
            input: [input],
            filterResults: [.input(input)],
            processorResults: [.single(output)]
        )

        let results = try await collect(sut)

        #expect(results == [output])
    }

    @Test func test_shouldCallProcessor_onValidInput() async throws {

        let input = makeSomeString()
        let (sut, _, processor) = makeSUT(
            input: [input],
            filterResults: [.input(input)]
        )

        _ = try await collect(sut)

        #expect(processor.payloads == [input])
    }

    @Test func test_shouldSkipBlanks_andProcessValidInput() async throws {

        let input = makeSomeString()
        let (sut, _, processor) = makeSUT(
            input: [makeSomeString(), makeSomeString(), input],
            filterResults: [.skip, .skip, .input(input)]
        )

        _ = try await collect(sut)

        #expect(processor.payloads == [input])
    }

    @Test func test_shouldNotCallProcessor_onQuitInput() async throws {

        let (sut, _, processor) = makeSUT(
            input: ["q"],
            filterResults: [.quit]
        )

        _ = try await collect(sut)

        #expect(processor.payloads.isEmpty)
    }

    @Test func test_shouldStopProcessing_afterQuit() async throws {

        let input = makeSomeString()
        let (sut, _, processor) = makeSUT(
            input: [input, makeSomeString()],
            filterResults: [.input(input), .quit]
        )

        _ = try await collect(sut)

        #expect(processor.payloads == [input])
    }

    @Test func test_shouldProcessMultipleInputs_beforeQuit() async throws {

        let first = makeSomeString()
        let second = makeSomeString()
        let (sut, _, processor) = makeSUT(
            input: [makeSomeString(), first, makeSomeString(), second, makeSomeString()],
            filterResults: [.skip, .input(first), .skip, .input(second), .quit]
        )

        _ = try await collect(sut)

        #expect(processor.payloads == [first, second])
    }

    @Test func test_shouldPassReaderOutputToFilter() async throws {

        let input = makeSomeString()
        let (sut, filter, _) = makeSUT(
            input: [input],
            filterResults: [.quit]
        )

        _ = try await collect(sut)

        #expect(filter.payloads == [input])
    }

    @Test func test_shouldPassFilterOutputToProcessor() async throws {

        let filtered = makeSomeString()
        let (sut, _, processor) = makeSUT(
            input: [makeSomeString()],
            filterResults: [.input(filtered), .quit]
        )

        _ = try await collect(sut)

        #expect(processor.payloads == [filtered])
    }

    @Test func test_shouldYieldMultipleElements_fromSingleInput() async throws {

        let input = makeSomeString()
        let elements = [makeSomeString(), makeSomeString(), makeSomeString()]
        let (sut, _, _) = makeSUT(
            input: [input],
            filterResults: [.input(input)],
            processorResults: [.many(elements)]
        )

        let results = try await collect(sut)

        #expect(results == elements)
    }

    // MARK: - Helpers

    private typealias SUT = Loop<String>
    private typealias ReaderSpy = CallSpy<Void, String?>
    private typealias FilterSpy = CallSpy<String, FilterResult>
    private typealias ProcessorSpy = AsyncSpyOf<String, AsyncThrowingStream<String, Error>>

    private enum StreamStub {
        case single(String)
        case many([String])

        func toStream() -> AsyncThrowingStream<String, Error> {
            switch self {
            case .single(let value):
                AsyncThrowingStream {
                    $0.yield(value)
                    $0.finish()
                }
            case .many(let values):
                AsyncThrowingStream { c in
                    for value in values { c.yield(value) }
                    c.finish()
                }
            }
        }
    }

    private func makeSUT(
        input: [String],
        filterResults: [FilterResult],
        processorResults: [StreamStub]? = nil,
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (SUT, FilterSpy, ProcessorSpy) {

        let reader = ReaderSpy(stubs: input + [nil])
        let filter = FilterSpy(stubs: filterResults)
        let stubs = (processorResults ?? input.map { _ in .single(makeSomeString()) })
            .map { stub -> Result<AsyncThrowingStream<String, Error>, Error> in
                .success(stub.toStream())
            }
        let processor = ProcessorSpy(stubs: stubs)
        let sut = SUT(
            inputReader: { reader.call() },
            filter: filter.call,
            processor: { try await processor.call(payload: $0) }
        )
        trackForMemoryLeaks(sut, sourceLocation: sourceLocation)
        trackForMemoryLeaks(reader, sourceLocation: sourceLocation)
        trackForMemoryLeaks(filter, sourceLocation: sourceLocation)
        trackForMemoryLeaks(processor, sourceLocation: sourceLocation)
        return (sut, filter, processor)
    }

    private func collect(_ loop: SUT) async throws -> [String] {
        var results = [String]()
        for try await value in loop {
            results.append(value)
        }
        return results
    }
}

