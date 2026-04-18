import Hummingbird
import Logging

func addWebhookRoute(to router: Router<some RequestContext>, config: Config, logger: Logger) {
    router.post("/\(config.webhookPath)") { request, _ in
        var log = logger
        log[metadataKey: "path"] = .string(request.uri.path)
        log[metadataKey: "method"] = .string(request.method.rawValue)
        log[metadataKey: "mode"] = .string(config.diagnosticMode.map { "\($0)" } ?? "normal")
        log.info("webhook ack")
        return Response(status: .ok, body: .init(byteBuffer: .init(string: "ok")))
    }
}
