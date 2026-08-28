import Foundation
import FolioTellCore
import Testing

struct FolioDocumentLoaderTests {

    @Test func test_load_shouldReturnDocument_onMarkdownData() throws {

        let document = try FolioDocumentLoader.load(data: Data("# Title".utf8), fileName: "lecture.md")

        #expect(document.projection == DocumentProjection(fileName: "lecture.md", text: "# Title"))
    }

    @Test func test_load_shouldReturnDocument_onLongMarkdownExtension() throws {

        let document = try FolioDocumentLoader.load(data: Data("Notes".utf8), fileName: "lecture.markdown")

        #expect(document.fileName == "lecture.markdown")
    }

    @Test func test_load_shouldReturnDocument_onPlainTextData() throws {

        let document = try FolioDocumentLoader.load(data: Data("Notes".utf8), fileName: "lecture.txt")

        #expect(document.text == "Notes")
    }

    @Test func test_load_shouldThrowUnreadableFile_onMissingData() {

        #expect(throws: FolioDocumentError.unreadableFile) {
            _ = try FolioDocumentLoader.load(data: nil, fileName: "lecture.md")
        }
    }

    @Test func test_load_shouldThrowUnsupportedTextEncoding_onInvalidUTF8() {

        #expect(throws: FolioDocumentError.unsupportedTextEncoding) {
            _ = try FolioDocumentLoader.load(data: Data([0xC3, 0x28]), fileName: "lecture.md")
        }
    }

    @Test func test_load_shouldThrowEmptyDocument_onWhitespaceOnlyText() {

        #expect(throws: FolioDocumentError.emptyDocument) {
            _ = try FolioDocumentLoader.load(data: Data(" \n\t".utf8), fileName: "lecture.md")
        }
    }

    @Test func test_load_shouldThrowUnsupportedExtension_onPDF() {

        #expect(throws: FolioDocumentError.unsupportedExtension("pdf")) {
            _ = try FolioDocumentLoader.load(data: Data("Notes".utf8), fileName: "lecture.pdf")
        }
    }
}

// MARK: - Helpers

private struct DocumentProjection: Equatable {
    let fileName: String
    let text: String
}

private extension FolioDocument {

    var projection: DocumentProjection {
        DocumentProjection(fileName: fileName, text: text)
    }
}
