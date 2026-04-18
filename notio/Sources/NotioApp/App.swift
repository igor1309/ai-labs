import Hummingbird
import Logging

public func buildApp(config: Config, logger: Logger? = nil) -> some ApplicationProtocol {
    let effectiveLogger = logger ?? makeLogger(label: "notio")
    let router = Router()
    addHealthRoute(to: router)
    addVersionRoute(to: router, config: config)
    addWebhookRoute(to: router, config: config, logger: effectiveLogger)
    return Application(
        router: router,
        configuration: .init(address: .hostname("0.0.0.0", port: config.port))
    )
}
