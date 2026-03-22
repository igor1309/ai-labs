import Foundation
import Testing

final class NetworkClientTests: TestContext {

    @Test func test_send_shouldPassInputToRequestFactory() async throws {

        let input = makeInput()
        let (sut, spy) = makeSUT()

        _ = try await sut.send(input)

        #expect(spy.payloads == [input])
    }

    @Test func test_send_shouldThrow_onRequestFactoryError() throws {

        let (sut, _) = makeSUT(requestFactoryStubs: [.failure(makeSomeError())])

        #expect(throws: (any Error).self) {
            _ = try sut.send(makeInput())
        }
    }

    // MARK: - Helpers

    private typealias SUT = NetworkClient<Input>
    private typealias RequestFactorySpy = CallSpy<Input, Result<Void, Error>>

    private func makeSUT(
        requestFactoryStubs: [Result<Void, Error>] = [.success(())],
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (SUT, RequestFactorySpy) {

        let spy = RequestFactorySpy(stubs: requestFactoryStubs)
        let sut = SUT(requestFactory: spy.call)
        trackForMemoryLeaks(sut, sourceLocation: sourceLocation)
        trackForMemoryLeaks(spy, sourceLocation: sourceLocation)
        return (sut, spy)
    }

    private struct Input: Equatable {

        let value: String
    }

    private func makeInput(
        _ value: String = makeSomeString()
    ) -> Input {

        return .init(value: value)
    }
}

private class NetworkClient<Input> {

    typealias RequestFactory = (Input) throws -> Void

    private let requestFactory: RequestFactory

    init(requestFactory: @escaping RequestFactory) {

        self.requestFactory = requestFactory
    }

    func send(_ input: Input) throws {

        try requestFactory(input)
    }
}
