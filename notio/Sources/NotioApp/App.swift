import Hummingbird
import Logging

func buildApp(config: Config) -> some ApplicationProtocol {
    let logger = makeLogger(label: "notio")
    let router = Router()
    addHealthRoute(to: router)
    addVersionRoute(to: router, config: config)
    addWebhookRoute(to: router, config: config, logger: logger)
    return Application(
        router: router,
        configuration: .init(address: .hostname("0.0.0.0", port: config.port))
    )
}
