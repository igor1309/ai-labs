import SwiftUI

@main
struct FolioTellApp: App {

    var body: some Scene {
        DocumentGroup(viewing: FolioFileDocument.self) { configuration in
            ReaderView(
                loadedDocument: configuration.document.loadedDocument,
                fileName: configuration.fileURL?.lastPathComponent ?? "Document"
            )
        }
    }
}
