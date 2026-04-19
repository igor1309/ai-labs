import AsyncHTTPClient
import Foundation
import Logging
import NIOCore
import NIOFoundationCompat

public struct SupabaseCaptureStore: CaptureStore {

    private let url: String
    private let apiKey: String
    private let httpClient: HTTPClient
    private let logger: Logger

    public init(url: String, apiKey: String, httpClient: HTTPClient, logger: Logger) {
        self.url = url
        self.apiKey = apiKey
        self.httpClient = httpClient
        self.logger = logger
    }

    public func save(_ item: CapturedItem) async throws {
        let row = SupabaseRow(from: item)
        let body = try JSONEncoder().encode(row)

        var request = HTTPClientRequest(url: "\(url)/rest/v1/captured_items")
        request.method = .POST
        request.headers.add(name: "apikey", value: apiKey)
        request.headers.add(name: "Authorization", value: "Bearer \(apiKey)")
        request.headers.add(name: "Content-Type", value: "application/json")
        request.headers.add(name: "Prefer", value: "return=minimal")
        request.body = .bytes(body)

        let response = try await httpClient.execute(request, timeout: .seconds(10))
        let status = response.status.code

        guard (200..<300).contains(status) else {
            let responseBody = try? await response.body.collect(upTo: 1_048_576)
            let message = responseBody.flatMap { String(data: Data(buffer: $0), encoding: .utf8) } ?? "unknown"
            logger.error("supabase insert failed", metadata: [
                "status": .string("\(status)"),
                "body": .string(message),
            ])
            throw StoreError.insertFailed(status: Int(status), message: message)
        }

        logger.info("captured item saved", metadata: [
            "kind": .string(item.kind.rawValue),
            "source_type": .string(item.sourceType?.rawValue ?? "none"),
        ])
    }

    public enum StoreError: Error {
        case insertFailed(status: Int, message: String)
    }
}

private struct SupabaseRow: Encodable {

    let kind: String
    let source_type: String?
    let captured_at: String
    let url: String?
    let note: String?
    let enrichment: String

    init(from item: CapturedItem) {
        self.kind = item.kind.rawValue
        self.source_type = item.sourceType?.rawValue
        self.captured_at = ISO8601DateFormatter().string(from: item.capturedAt)
        self.url = item.url
        self.note = item.note
        self.enrichment = item.enrichment.rawValue
    }
}
