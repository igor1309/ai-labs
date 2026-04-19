import Foundation
import Hummingbird
import Logging
import NIOCore

func addWebhookRoute(
    to router: Router<some RequestContext>,
    config: Config,
    logger: Logger,
    store: (any CaptureStore)?,
    enricher: any Enricher,
    now: @escaping @Sendable () -> Date = { Date() }
) {
    router.post("/\(config.webhookPath)") { request, _ in
        let start = now()
        let mode = config.diagnosticMode
        let bodyData = try? await readBody(request)

        var metadata = baseMetadata(request: request, mode: mode)

        switch mode {
        case .inspect:
            appendInspectMetadata(bodyData: bodyData, to: &metadata)
        case nil, .ack:
            let update = decodeUpdate(bodyData)
            appendUpdateMetadata(update, to: &metadata)
            if mode == nil, let update {
                captureInBackground(update: update, store: store, enricher: enricher, logger: logger)
            }
        case .delay(let ms):
            try await Task.sleep(for: .milliseconds(ms))
        case .fail:
            break
        }

        return respond(mode: mode, start: start, now: now, metadata: &metadata, logger: logger)
    }
}

// MARK: - Helpers

private func respond(
    mode: DiagnosticMode?,
    start: Date,
    now: @escaping @Sendable () -> Date,
    metadata: inout Logger.Metadata,
    logger: Logger
) -> Response {

    let status: HTTPResponse.Status = if case .fail(let code) = mode { .init(code: code) } else { .ok }
    let response = Response(status: status, body: .init(byteBuffer: ByteBuffer(string: "ok")))

    metadata["status"] = .string("\(response.status.code)")
    metadata["latency_ms"] = .string(String(format: "%.2f", now().timeIntervalSince(start) * 1000))
    logger.info("webhook ack", metadata: metadata)

    return response
}

private func readBody(_ request: Request) async throws -> Data? {
    guard let buf = try? await request.body.collect(upTo: 1_048_576) else { return nil }
    return Data(ByteBufferView(buf))
}

private func baseMetadata(request: Request, mode: DiagnosticMode?) -> Logger.Metadata {
    [
        "path": .string(request.uri.path),
        "method": .string(request.method.rawValue),
        "mode": .string(mode.map { "\($0)" } ?? "normal"),
    ]
}

private func decodeUpdate(_ bodyData: Data?) -> TelegramUpdate? {
    bodyData.flatMap { try? JSONDecoder().decode(TelegramUpdate.self, from: $0) }
}

private func appendUpdateMetadata(_ update: TelegramUpdate?, to metadata: inout Logger.Metadata) {
    guard let update else { return }
    metadata["update_id"] = .string("\(update.updateId)")
    if let chatId = update.message?.chat.id {
        metadata["chat_id"] = .string("\(chatId)")
    }
}

private func appendInspectMetadata(bodyData: Data?, to metadata: inout Logger.Metadata) {
    guard let bodyData,
          let json = try? JSONSerialization.jsonObject(with: bodyData) as? [String: Any]
    else { return }

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

private func captureInBackground(update: TelegramUpdate, store: (any CaptureStore)?, enricher: any Enricher, logger: Logger) {
    guard let store, let text = update.message?.text else { return }
    let service = CaptureService(store: store, enricher: enricher, logger: logger)
    Task {
        await service.capture(text: text, entities: update.message?.entities)
    }
}
