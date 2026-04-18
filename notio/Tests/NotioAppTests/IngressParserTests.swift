import Testing
@testable import NotioApp

@Suite("IngressParser")
struct IngressParserTests {
    @Test func test_noteOnly_shouldReturnNilUrlAndFullNote() {
        let result = IngressParser.parse(text: "check tradeoffs of actor-isolated stores later", entities: nil)
        #expect(result.primaryURL == nil)
        #expect(result.note == "check tradeoffs of actor-isolated stores later")
    }

    @Test func test_linkOnly_shouldReturnUrlAndNilNote() {
        let result = IngressParser.parse(
            text: "https://github.com/pointfreeco/swift-composable-architecture",
            entities: [.init(type: "url", offset: 0, length: 60)]
        )
        #expect(result.primaryURL == "https://github.com/pointfreeco/swift-composable-architecture")
        #expect(result.note == nil)
    }

    @Test func test_linkWithNote_shouldSplitUrlAndNote() {
        let url = "https://github.com/apple/swift-openapi-generator"
        let text = "\(url) check whether generation boundaries are worth borrowing"
        let result = IngressParser.parse(
            text: text,
            entities: [.init(type: "url", offset: 0, length: url.utf16.count)]
        )
        #expect(result.primaryURL == url)
        #expect(result.note == "check whether generation boundaries are worth borrowing")
    }

    @Test func test_multipleUrls_shouldUseFirstAsUrlAndKeepRestInNote() {
        let text = "https://example.com/main compare with https://example.com/alt and maybe https://github.com/org/repo later"
        let result = IngressParser.parse(
            text: text,
            entities: [
                .init(type: "url", offset: 0, length: 24),
                .init(type: "url", offset: 38, length: 24),
                .init(type: "url", offset: 73, length: 29),
            ]
        )
        #expect(result.primaryURL == "https://example.com/main")
        #expect(result.note == "compare with https://example.com/alt and maybe https://github.com/org/repo later")
    }

    @Test func test_utmParams_shouldBeStripped() {
        let url = "https://example.com/page?utm_source=twitter&utm_medium=social&id=42"
        let result = IngressParser.parse(
            text: url,
            entities: [.init(type: "url", offset: 0, length: url.utf16.count)]
        )
        #expect(result.primaryURL == "https://example.com/page?id=42")
        #expect(result.note == nil)
    }

    @Test func test_meaningfulQueryParams_shouldBePreserved() {
        let url = "https://example.com/search?q=swift&page=2"
        let result = IngressParser.parse(
            text: url,
            entities: [.init(type: "url", offset: 0, length: url.utf16.count)]
        )
        #expect(result.primaryURL == "https://example.com/search?q=swift&page=2")
    }

    @Test func test_noEntities_withUrl_shouldFallbackToRegex() {
        let result = IngressParser.parse(
            text: "check https://example.com/cool later",
            entities: nil
        )
        #expect(result.primaryURL == "https://example.com/cool")
        #expect(result.note == "check later")
    }

    @Test func test_emptyText_shouldReturnNilUrlAndNilNote() {
        let result = IngressParser.parse(text: "", entities: nil)
        #expect(result.primaryURL == nil)
        #expect(result.note == nil)
    }
}
