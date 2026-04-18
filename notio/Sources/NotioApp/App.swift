import Hummingbird
import Logging

func buildApp(config: Config) -> some ApplicationProtocol {
    let router = Router()
    addVersionRoute(to: router, config: config)
    return Application(
        router: router,
        configuration: .init(address: .hostname("0.0.0.0", port: config.port))
    )
}
