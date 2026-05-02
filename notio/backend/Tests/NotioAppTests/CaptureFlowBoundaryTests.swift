import Logging
import Testing
@testable import NotioApp

@Suite("CaptureFlowBoundary")
struct CaptureFlowBoundaryTests {
    @Test func test_enrichmentFailure_shouldStillReachSave() async {
        let store = SpyCaptureStore()
        let enricher = FailingEnricher()
        let sut = makeSUT(store: store, enricher: enricher)

        await sut.capture(text: "https://example.com", entities: nil)

        let saved = await store.savedItems
        #expect(saved.count == 1)
        #expect(saved.first?.enrichment == .failed)
    }

    @Test func test_successfulCapture_shouldCompleteAtStoreBoundary() async {
        let store = BoundaryTrackingStore()
        let sut = makeSUT(store: store, enricher: NullEnricher())

        await sut.capture(text: "hello", entities: nil)

        let saved = await store.savedItems
        #expect(saved.count == 1)
        let postSaveWork = await store.postSaveWorkPerformed
        #expect(!postSaveWork)
    }

    @Test func test_storeFailure_shouldBeTerminalFailurePath() async {
        let handler = CapturingLogHandler()
        let logger = Logger(label: "test") { _ in handler }
        let store = ThrowingCaptureStore()
        let sut = CaptureService(store: store, enricher: NullEnricher(), logger: logger)

        await sut.capture(text: "hello", entities: nil)

        let errorEvent = await handler.waitForError()
        #expect(errorEvent.message.description == "capture failed")
    }
}

// MARK: - Helpers

private extension CaptureFlowBoundaryTests {
    func makeSUT(store: some CaptureStore, enricher: some Enricher) -> CaptureService {
        CaptureService(
            store: store,
            enricher: enricher,
            logger: Logger(label: "test", factory: SwiftLogNoOpLogHandler.init)
        )
    }
}

private struct FailingEnricher: Enricher {
    func enrich(url: String, sourceType: CapturedItem.SourceType) async -> EnrichmentResult {
        EnrichmentResult(title: nil, description: nil, status: .failed)
    }
}

private actor BoundaryTrackingStore: CaptureStore {
    private(set) var savedItems: [CapturedItem] = []
    private(set) var postSaveWorkPerformed = false

    func save(_ item: CapturedItem) async throws {
        savedItems.append(item)
    }

    func markPostSaveWork() {
        postSaveWorkPerformed = true
    }
}
