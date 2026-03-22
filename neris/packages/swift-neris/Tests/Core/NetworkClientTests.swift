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

    @Test func test_send_shouldThrow_onTransportError() async throws {

        let (sut, _) = makeSUT(transportStubs: [.failure(makeSomeError())])

        await #expect(throws: (any Error).self) {
            _ = try await sut.send(makeInput())
        }
    }

    @Test func test_send_shouldPassTransportResultToResponseParser() async throws {

        let data = Data("transport".utf8)
        let response = URLResponse()
        let (sut, spies) = makeSUT(transportStubs: [.success((data, response))])

        _ = try await sut.send(makeInput())

        #expect(spies.responseParser.payloads.map(\.0) == [data])
    }

    // MARK: - Helpers

    private typealias SUT = NetworkClient<Input>
    private typealias RequestFactoryResult = Result<URLRequest, Error>
    private typealias RequestFactorySpy = CallSpy<Input, RequestFactoryResult>
    private typealias TransportResult = (Data, URLResponse)
    private typealias TransportSpy = AsyncSpyOf<URLRequest, TransportResult>
    private typealias ResponseParserSpy = CallSpy<TransportResult, Void>

    private struct Spies {
        let requestFactory: RequestFactorySpy
        let transport: TransportSpy
        let responseParser: ResponseParserSpy
    }

    private func makeSUT(
        requestFactoryStubs: [RequestFactoryResult] = [.success(makeSomeRequest())],
        transportStubs: [TransportSpy.Stub] = [.success(makeTransportResult())],
        _ sourceLocation: SourceLocation = #_sourceLocation
    ) -> (sut: SUT, spies: Spies) {

        let requestFactory = RequestFactorySpy(stubs: requestFactoryStubs)
        let transport = TransportSpy(stubs: transportStubs)
        let responseParser = ResponseParserSpy()
        let sut = SUT(
            requestFactory: requestFactory.call,
            transport: transport.call(payload:),
            responseParser: responseParser.call(payload:)
        )
        trackForMemoryLeaks(sut, sourceLocation: sourceLocation)
        trackForMemoryLeaks(requestFactory, sourceLocation: sourceLocation)
        trackForMemoryLeaks(transport, sourceLocation: sourceLocation)
        trackForMemoryLeaks(responseParser, sourceLocation: sourceLocation)
        return (sut, Spies(requestFactory: requestFactory, transport: transport, responseParser: responseParser))
    }

    private struct Input: Equatable {

        let value: String
    }

    private func makeInput(
        _ value: String = makeSomeString()
    ) -> Input {

        return .init(value: value)
    }

    private static func makeTransportResult() -> TransportResult {

        return (Data(), URLResponse())
    }
}

private class NetworkClient<Input> {

    typealias RequestFactory = (Input) throws -> URLRequest
    typealias Transport = @Sendable (URLRequest) async throws -> (Data, URLResponse)
    typealias ResponseParser = ((Data, URLResponse)) -> Void

    private let requestFactory: RequestFactory
    private let transport: Transport
    private let responseParser: ResponseParser

    init(
        requestFactory: @escaping RequestFactory,
        transport: @escaping Transport,
        responseParser: @escaping ResponseParser
    ) {

        self.requestFactory = requestFactory
        self.transport = transport
        self.responseParser = responseParser
    }

    func send(_ input: Input) async throws {

        let request = try requestFactory(input)
        let result = try await transport(request)
        responseParser(result)
    }
}
