import Testing
@testable import NotioApp

@Suite("HTMLMetadataExtractor")
struct HTMLMetadataExtractorTests {
    @Test func test_shouldExtractTitle() {
        let html = "<html><head><title>Hello World</title></head></html>"
        let result = HTMLMetadataExtractor.extract(from: html)
        #expect(result.title == "Hello World")
    }

    @Test func test_shouldExtractMetaDescription() {
        let html = """
        <html><head><meta name="description" content="A great page"></head></html>
        """
        let result = HTMLMetadataExtractor.extract(from: html)
        #expect(result.description == "A great page")
    }

    @Test func test_shouldExtractBothTitleAndDescription() {
        let html = """
        <html><head>
        <title>My Page</title>
        <meta name="description" content="Page about things">
        </head></html>
        """
        let result = HTMLMetadataExtractor.extract(from: html)
        #expect(result.title == "My Page")
        #expect(result.description == "Page about things")
    }

    @Test func test_shouldReturnNilForBothWhenMissing() {
        let html = "<html><head></head><body>No metadata here</body></html>"
        let result = HTMLMetadataExtractor.extract(from: html)
        #expect(result.title == nil)
        #expect(result.description == nil)
    }

    @Test func test_shouldHandleMalformedHTML() {
        let html = "<html><head><title>Unclosed"
        let result = HTMLMetadataExtractor.extract(from: html)
        #expect(result.title == nil)
    }

    @Test func test_shouldHandleCaseInsensitiveTitle() {
        let html = "<HTML><HEAD><TITLE>Upper Case</TITLE></HEAD></HTML>"
        let result = HTMLMetadataExtractor.extract(from: html)
        #expect(result.title == "Upper Case")
    }

    @Test func test_shouldHandleSingleQuotedContent() {
        let html = "<meta name='description' content='Single quoted'>"
        let result = HTMLMetadataExtractor.extract(from: html)
        #expect(result.description == "Single quoted")
    }

    @Test func test_shouldReturnNilForEmptyTitle() {
        let html = "<title></title>"
        let result = HTMLMetadataExtractor.extract(from: html)
        #expect(result.title == nil)
    }

    @Test func test_shouldTrimWhitespaceFromTitle() {
        let html = "<title>  Spaced Title  </title>"
        let result = HTMLMetadataExtractor.extract(from: html)
        #expect(result.title == "Spaced Title")
    }

    @Test func test_shouldHandleApostropheInDoubleQuotedDescription() {
        let html = #"<meta name="description" content="Bob's repo">"#
        let result = HTMLMetadataExtractor.extract(from: html)
        #expect(result.description == "Bob's repo")
    }

    @Test func test_shouldHandleDoubleQuoteInSingleQuotedDescription() {
        let html = "<meta name='description' content='A \"great\" page'>"
        let result = HTMLMetadataExtractor.extract(from: html)
        #expect(result.description == #"A "great" page"#)
    }

    @Test func test_shouldHandleMultilineTitle() {
        let html = """
        <title>
            Multi Line Title
        </title>
        """
        let result = HTMLMetadataExtractor.extract(from: html)
        #expect(result.title == "Multi Line Title")
    }
}
