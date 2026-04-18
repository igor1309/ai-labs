import Foundation
import Hummingbird
import Logging
import NIOCore

func addWebhookRoute(to router: Router<some RequestContext>, config: Config, logger: Logger) {
    router.post("/\(config.webhookPath)") { request, _ in
        let start = Date()

        let response = Response(status: .ok, body: .init(byteBuffer: ByteBuffer(string: "ok")))
        let latencyMs = Date().timeIntervalSince(start) * 1000

        let metadata: Logger.Metadata = [
            "path": .string(request.uri.path),
            "method": .string(request.method.rawValue),
            "mode": .string(config.diagnosticMode.map { "\($0)" } ?? "normal"),
            "status": .string("\(response.status.code)"),
            "latency_ms": .string(String(format: "%.2f", latencyMs)),
        ]

        logger.info("webhook ack", metadata: metadata)
        return response
    }
}
