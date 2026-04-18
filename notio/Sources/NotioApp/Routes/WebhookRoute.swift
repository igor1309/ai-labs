import Hummingbird

func addWebhookRoute(to router: Router<some RequestContext>, config: Config) {
    router.post("/\(config.webhookPath)") { _, _ in
        Response(status: .ok, body: .init(byteBuffer: .init(string: "ok")))
    }
}
