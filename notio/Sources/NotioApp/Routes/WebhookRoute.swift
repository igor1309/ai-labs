import Foundation
import Hummingbird
import Logging
import NIOCore

private struct TelegramUpdate: Decodable {
    let update_id: Int
}

func addWebhookRoute(to router: Router<some RequestContext>, config: Config, logger: Logger) {
    router.post("/\(config.webhookPath)") { request, context in
        let start = Date()
        let body = try await request.body.collect(upTo: .max)
        let updateID = (try? JSONDecoder().decode(TelegramUpdate.self, from: body))?.update_id

        let response = Response(status: .ok, body: .init(byteBuffer: ByteBuffer(string: "ok")))
        let latencyMs = Date().timeIntervalSince(start) * 1000

        var metadata: Logger.Metadata = [
            "path": .string(request.uri.path),
            "method": .string(request.method.rawValue),
            "mode": .string(config.diagnosticMode.map { "\($0)" } ?? "normal"),
            "status": .string("\(response.status.code)"),
            "latency_ms": .string(String(format: "%.2f", latencyMs)),
        ]
        if let updateID { metadata["update_id"] = .string("\(updateID)") }

        logger.info("webhook ack", metadata: metadata)
        return response
    }
}
