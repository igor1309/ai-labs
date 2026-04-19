import Hummingbird
import Logging

public func buildApp(
    config: Config,
    logger: Logger? = nil,
    store: (any CaptureStore)? = nil,
    enricher: any Enricher,
    messenger: (any CaptureFeedbackMessenger)? = nil
) -> some ApplicationProtocol {

    let effectiveLogger = logger ?? makeLogger(label: "notio")
    let router = Router()
    addHealthRoute(to: router)
    addVersionRoute(to: router, config: config)
    addWebhookRoute(to: router, config: config, logger: effectiveLogger, store: store, enricher: enricher, messenger: messenger)
    return Application(
        router: router,
        configuration: .init(address: .hostname("0.0.0.0", port: config.port))
    )
}
