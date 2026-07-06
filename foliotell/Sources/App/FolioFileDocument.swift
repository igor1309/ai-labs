#if !FOLIOTELL_SINGLE_TARGET
import FolioTellCore
#endif
import SwiftUI
import UniformTypeIdentifiers

struct FolioFileDocument: FileDocument {
    static var readableContentTypes: [UTType] {
        [
            .folioTellMarkdown,
            .folioTellMarkdownLong,
            .plainText,
        ]
    }

    let loadedDocument: LoadedFolioDocument

    init(loadedDocument: LoadedFolioDocument = .failure(fileName: "Document", error: .unreadableFile)) {
        self.loadedDocument = loadedDocument
    }

    init(configuration: ReadConfiguration) throws {

        let fileName = configuration.file.filename ?? "Document"
        do {
            loadedDocument = .success(try FolioDocumentLoader.load(data: configuration.file.regularFileContents, fileName: fileName))
        } catch let error as FolioDocumentError {
            loadedDocument = .failure(fileName: fileName, error: error)
        } catch {
            loadedDocument = .failure(fileName: fileName, error: .unreadableFile)
        }
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {

        throw CocoaError(.fileWriteNoPermission)
    }
}

enum LoadedFolioDocument {
    case failure(fileName: String, error: FolioDocumentError)
    case success(FolioDocument)
}

private extension UTType {
    static let folioTellMarkdown = UTType(filenameExtension: "md", conformingTo: .plainText)!
    static let folioTellMarkdownLong = UTType(filenameExtension: "markdown", conformingTo: .plainText)!
}
