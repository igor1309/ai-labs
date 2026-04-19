struct CompositeEnricher: Enricher {

    private let webPage: any Enricher
    private let githubRepo: any Enricher

    init(webPage: any Enricher, githubRepo: any Enricher) {
        self.webPage = webPage
        self.githubRepo = githubRepo
    }

    func enrich(url: String, sourceType: CapturedItem.SourceType) async -> EnrichmentResult {
        switch sourceType {
        case .githubRepo: await githubRepo.enrich(url: url, sourceType: sourceType)
        case .webPage: await webPage.enrich(url: url, sourceType: sourceType)
        }
    }
}
