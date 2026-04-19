import Foundation
import Testing
@testable import NotioApp

@Suite("CapturedItem")
struct CapturedItemTests {
    @Test func test_noteOnly_shouldHaveKindNote() {
        let result = IngressResult(primaryURL: nil, note: "remember this")
        let item = CapturedItem(from: result)
        #expect(item.kind == .note)
        #expect(item.note == "remember this")
        #expect(item.url == nil)
        #expect(item.sourceType == nil)
        #expect(item.enrichment == .none)
    }

    @Test func test_linkOnly_shouldHaveKindLink() {
        let result = IngressResult(primaryURL: "https://example.com/page", note: nil)
        let item = CapturedItem(from: result)
        #expect(item.kind == .link)
        #expect(item.url == "https://example.com/page")
        #expect(item.note == nil)
    }

    @Test func test_linkWithNote_shouldHaveKindLink() {
        let result = IngressResult(primaryURL: "https://example.com", note: "check later")
        let item = CapturedItem(from: result)
        #expect(item.kind == .link)
        #expect(item.url == "https://example.com")
        #expect(item.note == "check later")
    }

    @Test func test_githubRepoUrl_shouldHaveSourceTypeGithubRepo() {
        let result = IngressResult(primaryURL: "https://github.com/apple/swift", note: nil)
        let item = CapturedItem(from: result)
        #expect(item.sourceType == .githubRepo)
    }

    @Test func test_nonGithubUrl_shouldHaveSourceTypeWebPage() {
        let result = IngressResult(primaryURL: "https://example.com/article", note: nil)
        let item = CapturedItem(from: result)
        #expect(item.sourceType == .webPage)
    }

    @Test func test_githubNonRepoUrl_shouldHaveSourceTypeWebPage() {
        let result = IngressResult(primaryURL: "https://github.com/apple/swift/issues/123", note: nil)
        let item = CapturedItem(from: result)
        #expect(item.sourceType == .webPage)
    }

    @Test func test_capturedAt_shouldBeSet() {
        let before = Date()
        let result = IngressResult(primaryURL: nil, note: "test")
        let item = CapturedItem(from: result)
        let after = Date()
        #expect(item.capturedAt >= before)
        #expect(item.capturedAt <= after)
    }

    @Test func test_noteOnly_shouldHaveEnrichmentNone() {
        let result = IngressResult(primaryURL: nil, note: "just a note")
        let item = CapturedItem(from: result)
        #expect(item.enrichment == .none)
    }

    @Test func test_link_shouldHaveEnrichmentNone() {
        let result = IngressResult(primaryURL: "https://example.com", note: nil)
        let item = CapturedItem(from: result)
        #expect(item.enrichment == .none)
    }

    @Test func test_noteOnly_shouldHaveNilTitleAndDescription() {
        let result = IngressResult(primaryURL: nil, note: "just a note")
        let item = CapturedItem(from: result)
        #expect(item.capturedTitle == nil)
        #expect(item.capturedDescription == nil)
    }

    @Test func test_link_shouldHaveNilTitleAndDescription() {
        let result = IngressResult(primaryURL: "https://example.com", note: nil)
        let item = CapturedItem(from: result)
        #expect(item.capturedTitle == nil)
        #expect(item.capturedDescription == nil)
    }

    @Test func test_applying_shouldMapFullResult() {
        let item = CapturedItem(from: IngressResult(primaryURL: "https://example.com", note: nil))
        let enrichment = EnrichmentResult(title: "Example", description: "A page", status: .full)

        let enriched = item.applying(enrichment)

        #expect(enriched.capturedTitle == "Example")
        #expect(enriched.capturedDescription == "A page")
        #expect(enriched.enrichment == .full)
        #expect(enriched.kind == .link)
        #expect(enriched.url == "https://example.com")
    }

    @Test func test_applying_shouldMapPartialResult() {
        let item = CapturedItem(from: IngressResult(primaryURL: "https://example.com", note: nil))
        let enrichment = EnrichmentResult(title: "Only Title", description: nil, status: .partial)

        let enriched = item.applying(enrichment)

        #expect(enriched.capturedTitle == "Only Title")
        #expect(enriched.capturedDescription == nil)
        #expect(enriched.enrichment == .partial)
    }

    @Test func test_applying_shouldMapFailedResult() {
        let item = CapturedItem(from: IngressResult(primaryURL: "https://example.com", note: nil))
        let enrichment = EnrichmentResult(title: nil, description: nil, status: .failed)

        let enriched = item.applying(enrichment)

        #expect(enriched.capturedTitle == nil)
        #expect(enriched.capturedDescription == nil)
        #expect(enriched.enrichment == .failed)
    }

    @Test func test_applying_shouldPreserveNoteItem() {
        let item = CapturedItem(from: IngressResult(primaryURL: nil, note: "just a note"))
        let enrichment = EnrichmentResult(title: "Ignored", description: "Ignored", status: .full)

        let result = item.applying(enrichment)

        #expect(result.enrichment == .none)
        #expect(result.capturedTitle == nil)
        #expect(result.capturedDescription == nil)
    }
}
