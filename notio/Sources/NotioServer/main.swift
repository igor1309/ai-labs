import AsyncHTTPClient
import NotioApp

let config = try Config.fromEnvironment()
let logger = makeLogger(label: "notio")

let store: (any CaptureStore)?
if let url = config.supabaseURL, let key = config.supabaseKey {
    store = SupabaseCaptureStore(url: url, apiKey: key, httpClient: HTTPClient.shared, logger: logger)
    logger.info("supabase store enabled")
} else {
    store = nil
    logger.info("supabase store disabled (no credentials)")
}

let app = buildApp(config: config, logger: logger, store: store)
try await app.runService()
