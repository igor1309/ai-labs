import Hummingbird

struct VersionResponse: ResponseCodable {
    let version: String
}

func addVersionRoute(to router: Router<some RequestContext>, config: Config) {
    router.get("/version") { _, _ in
        VersionResponse(version: config.version)
    }
}
