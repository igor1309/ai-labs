import Logging
import Testing
@testable import NotioApp

@Suite("CaptureService")
struct CaptureServiceTests {
    @Test func test_noteItem_shouldSkipEnrichment() async {
        let store = SpyCaptureStore()
        let enricher = SpyEnricher()
        let sut = makeSUT(store: store, enricher: enricher)

        await sut.capture(text: "just a note", entities: nil)

        let saved = await store.savedItems
        #expect(saved.count == 1)
        #expect(saved.first?.kind == .note)
        #expect(saved.first?.enrichment == CapturedItem.Enrichment.none)
        #expect(saved.first?.capturedTitle == nil)
        let enrichCalls = await enricher.calls
        #expect(enrichCalls.isEmpty)
    }

    @Test func test_linkItem_shouldCallEnricherWithConcreteSourceType() async {
        let store = SpyCaptureStore()
        let enricher = SpyEnricher(result: EnrichmentResult(title: "T", description: "D", status: .full))
        let sut = makeSUT(store: store, enricher: enricher)

        await sut.capture(text: "https://example.com/page", entities: nil)

        let enrichCalls = await enricher.calls
        #expect(enrichCalls.count == 1)
        #expect(enrichCalls.first?.url == "https://example.com/page")
        #expect(enrichCalls.first?.sourceType == .webPage)
    }

    @Test func test_linkItem_shouldSaveEnrichedItem() async {
        let store = SpyCaptureStore()
        let enricher = SpyEnricher(result: EnrichmentResult(title: "Page", description: "Desc", status: .full))
        let sut = makeSUT(store: store, enricher: enricher)

        await sut.capture(text: "https://example.com", entities: nil)

        let saved = await store.savedItems
        #expect(saved.first?.capturedTitle == "Page")
        #expect(saved.first?.capturedDescription == "Desc")
        #expect(saved.first?.enrichment == .full)
    }

    @Test func test_enrichmentFailure_shouldStillSaveItem() async {
        let store = SpyCaptureStore()
        let enricher = SpyEnricher(result: EnrichmentResult(title: nil, description: nil, status: .failed))
        let sut = makeSUT(store: store, enricher: enricher)

        await sut.capture(text: "https://example.com", entities: nil)

        let saved = await store.savedItems
        #expect(saved.count == 1)
        #expect(saved.first?.enrichment == .failed)
        #expect(saved.first?.url == "https://example.com")
    }

    @Test func test_githubRepoLink_shouldPassGithubRepoSourceType() async {
        let store = SpyCaptureStore()
        let enricher = SpyEnricher(result: EnrichmentResult(title: "apple/swift", description: nil, status: .partial))
        let sut = makeSUT(store: store, enricher: enricher)

        await sut.capture(text: "https://github.com/apple/swift", entities: nil)

        let enrichCalls = await enricher.calls
        #expect(enrichCalls.first?.sourceType == .githubRepo)
    }

    @Test func test_nullEnricher_shouldSaveLinkAsFailed() async {
        let store = SpyCaptureStore()
        let sut = makeSUT(store: store, enricher: NullEnricher())

        await sut.capture(text: "https://example.com", entities: nil)

        let saved = await store.savedItems
        #expect(saved.count == 1)
        #expect(saved.first?.enrichment == .failed)
    }
}

// MARK: - Helpers

private extension CaptureServiceTests {
    typealias SUT = CaptureService

    func makeSUT(store: SpyCaptureStore, enricher: any Enricher) -> SUT {
        CaptureService(
            store: store,
            enricher: enricher,
            logger: Logger(label: "test", factory: SwiftLogNoOpLogHandler.init)
        )
    }
}

private actor SpyEnricher: Enricher {
    struct Call {
        let url: String
        let sourceType: CapturedItem.SourceType
    }

    private let result: EnrichmentResult
    private(set) var calls: [Call] = []

    init(result: EnrichmentResult = EnrichmentResult(title: nil, description: nil, status: .failed)) {
        self.result = result
    }

    func enrich(url: String, sourceType: CapturedItem.SourceType) async -> EnrichmentResult {
        calls.append(Call(url: url, sourceType: sourceType))
        return result
    }
}
