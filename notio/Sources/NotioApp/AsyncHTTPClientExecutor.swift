import AsyncHTTPClient
import Foundation
import NIOCore

public struct AsyncHTTPClientExecutor: HTTPExecutor, Sendable {

    private let httpClient: HTTPClient

    public init(httpClient: HTTPClient) {
        self.httpClient = httpClient
    }

    public func execute(url: String, body: Data, timeout: TimeInterval) async throws -> Int {
        var request = HTTPClientRequest(url: url)
        request.method = .POST
        request.headers.add(name: "Content-Type", value: "application/json")
        request.body = .bytes(body)
        let response = try await httpClient.execute(request, timeout: .seconds(Int64(timeout)))
        return Int(response.status.code)
    }
}

public extension TelegramMessageSender {
    init(botToken: String) {
        self.init(
            botToken: botToken,
            executor: AsyncHTTPClientExecutor(httpClient: HTTPClient.shared)
        )
    }
}
