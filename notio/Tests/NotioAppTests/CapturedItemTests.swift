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
}
