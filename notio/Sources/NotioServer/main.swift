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

let messenger: (any CaptureFeedbackMessenger)?
if let botToken = config.telegramBotToken {
    let executor = AsyncHTTPClientExecutor(httpClient: HTTPClient.shared)
    let sender = TelegramMessageSender(botToken: botToken, executor: executor)
    messenger = TelegramCaptureFeedbackMessenger(sender: sender, logger: logger)
    logger.info("telegram feedback enabled")
} else {
    messenger = nil
}

let app = buildApp(config: config, logger: logger, store: store, enricher: enricher, messenger: messenger)
try await app.runService()
