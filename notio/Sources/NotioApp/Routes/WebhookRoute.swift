import Foundation
import Hummingbird
import Logging
import NIOCore

func addWebhookRoute(to router: Router<some RequestContext>, config: Config, logger: Logger) {
    router.post("/\(config.webhookPath)") { request, _ in
        let start = Date()
        let mode = config.diagnosticMode

        var metadata: Logger.Metadata = [
            "path": .string(request.uri.path),
            "method": .string(request.method.rawValue),
            "mode": .string(mode.map { "\($0)" } ?? "normal"),
        ]

        let buf = try? await request.body.collect(upTo: 1_048_576)
        let bodyData = buf.flatMap { Data(ByteBufferView($0)) }

        if mode == .inspect {
            if let bodyData,
               let json = try? JSONSerialization.jsonObject(with: bodyData) as? [String: Any]
            {
                if let updateId = json["update_id"] {
                    metadata["update_id"] = .string("\(updateId)")
                }
                if let message = json["message"] as? [String: Any] {
                    if let chat = message["chat"] as? [String: Any], let chatId = chat["id"] {
                        metadata["chat_id"] = .string("\(chatId)")
                    }
                    if let text = message["text"] as? String {
                        metadata["text"] = .string(String(text.prefix(100)))
                    }
                }
            }
        } else if mode == nil || mode == .ack {
            if let bodyData,
               let update = try? JSONDecoder().decode(TelegramUpdate.self, from: bodyData)
            {
                metadata["update_id"] = .string("\(update.updateId)")
                if let chatId = update.message?.chat.id {
                    metadata["chat_id"] = .string("\(chatId)")
                }
            }
        }

        if case .delay(let ms) = mode {
            try await Task.sleep(for: .milliseconds(ms))
        }

        let status: HTTPResponse.Status
        if case .fail(let code) = mode {
            status = .init(code: code)
        } else {
            status = .ok
        }

        let response = Response(status: status, body: .init(byteBuffer: ByteBuffer(string: "ok")))
        let latencyMs = Date().timeIntervalSince(start) * 1000
        metadata["status"] = .string("\(response.status.code)")
        metadata["latency_ms"] = .string(String(format: "%.2f", latencyMs))

        logger.info("webhook ack", metadata: metadata)
        return response
    }
}
