import Foundation
import Testing

final class NetworkClientTests: TestContext {

    @Test func test_init_shouldNotCallCollaborators() {

        let (_, spies) = makeSUT()

        #expect(spies.requestFactory.callCount == 0)
        #expect(spies.transport.callCount == 0)
    }

    @Test func test_send_shouldPassInputToRequestFactory() async throws {

        let input = makeInput()
        let (sut, spies) = makeSUT()

        _ = try await sut.send(input)

        #expect(spies.requestFactory.payloads == [input])
    }

    @Test func test_send_shouldThrow_onRequestFactoryError() async throws {

        let (sut, _) = makeSUT(requestFactoryStubs: [.failure(makeSomeError())])

        await #expect(throws: (any Error).self) {
            _ = try await sut.send(makeInput())
        }
    }

    @Test func test_send_shouldPassRequestToTransport() async throws {

        let request = makeSomeRequest()
        let (sut, spies) = makeSUT(requestFactoryStubs: [.success(request)])

        _ = try await sut.send(makeInput())

        #expect(spies.transport.payloads == [request])
    }

    // MARK: - Helpers

    private typealias SUT = NetworkClient<Input>
    private typealias RequestFactoryResult = Result<URLRequest, Error>
    private typealias RequestFactorySpy = CallSpy<Input, RequestFactoryResult>
    private typealias TransportSpy = AsyncSpyOf<URLRequest, Void>

    private struct Spies {
        let requestFactory: RequestFactorySpy
        let transport: TransportSpy
    }

    private func makeSUT(
        requestFactoryStubs: [RequestFactoryResult] = [.success(makeSomeRequest())],
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (sut: SUT, spies: Spies) {

        let requestFactory = RequestFactorySpy(stubs: requestFactoryStubs)
        let transport = TransportSpy()
        let sut = SUT(requestFactory: requestFactory.call, transport: transport.call(payload:))
        trackForMemoryLeaks(sut, sourceLocation: sourceLocation)
        trackForMemoryLeaks(requestFactory, sourceLocation: sourceLocation)
        trackForMemoryLeaks(transport, sourceLocation: sourceLocation)
        return (sut, Spies(requestFactory: requestFactory, transport: transport))
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

    typealias RequestFactory = (Input) throws -> URLRequest
    typealias Transport = @Sendable (URLRequest) async throws -> Void

    private let requestFactory: RequestFactory
    private let transport: Transport

    init(requestFactory: @escaping RequestFactory, transport: @escaping Transport) {

        self.requestFactory = requestFactory
        self.transport = transport
    }

    func send(_ input: Input) async throws {

        let request = try requestFactory(input)
        try? await transport(request)
    }
}
