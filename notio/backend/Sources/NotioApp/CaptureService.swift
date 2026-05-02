import Logging

struct CaptureService: Sendable {

    private let store: any CaptureStore
    private let enricher: any Enricher
    private let logger: Logger

    init(store: any CaptureStore, enricher: any Enricher, logger: Logger) {
        self.store = store
        self.enricher = enricher
        self.logger = logger
    }

    func capture(text: String, entities: [TelegramUpdate.Entity]?) async {
        let result = IngressParser.parse(text: text, entities: entities)
        var item = CapturedItem(from: result)

        if item.kind == .link, let url = item.url, let sourceType = item.sourceType {
            let enrichment = await enricher.enrich(url: url, sourceType: sourceType)
            item = item.applying(enrichment)
        }

        do {
            try await store.save(item)
        } catch {
            logger.error("capture failed", metadata: ["error": .string("\(error)")])
        }
    }
}

/// Fallback enricher used when no real enricher is configured.
/// Returns `.failed` for all requests so link items never persist as `.none`.
public struct NullEnricher: Enricher, Sendable {
    public init() {}
    public func enrich(url: String, sourceType: CapturedItem.SourceType) async -> EnrichmentResult {
        EnrichmentResult(title: nil, description: nil, status: .failed)
    }
}
