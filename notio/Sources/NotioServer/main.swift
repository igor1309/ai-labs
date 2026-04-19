import AsyncHTTPClient
import Logging
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

let fetcher = AsyncHTTPClientFetcher(httpClient: HTTPClient.shared)
let enricher: any Enricher = CompositeEnricher(
    webPage: WebPageEnricher(fetcher: fetcher, logger: logger),
    githubRepo: GitHubRepoEnricher(fetcher: fetcher, logger: logger)
)

let app = buildApp(config: config, logger: logger, store: store, enricher: enricher)
try await app.runService()
