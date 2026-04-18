import Hummingbird

struct HealthResponse: ResponseCodable {
    let status: String
}

func addHealthRoute(to router: Router<some RequestContext>) {
    router.get("/health") { _, _ in
        HealthResponse(status: "ok")
    }
}
