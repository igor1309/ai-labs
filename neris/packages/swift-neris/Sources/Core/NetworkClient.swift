import Foundation

public final class NetworkClient<Input, Output>: @unchecked Sendable {

    public typealias RequestFactory = (Input) throws -> URLRequest
    public typealias Transport = @Sendable (URLRequest) async throws -> (Data, URLResponse)
    public typealias ResponseParser = ((Data, URLResponse)) throws -> Output

    private let requestFactory: RequestFactory
    private let transport: Transport
    private let responseParser: ResponseParser

    public init(
        requestFactory: @escaping RequestFactory,
        transport: @escaping Transport,
        responseParser: @escaping ResponseParser
    ) {

        self.requestFactory = requestFactory
        self.transport = transport
        self.responseParser = responseParser
    }

    public func send(_ input: Input) async throws -> Output {

        let request = try requestFactory(input)
        let result = try await transport(request)
        return try responseParser(result)
    }
}
