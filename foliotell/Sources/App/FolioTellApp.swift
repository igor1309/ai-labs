import SwiftUI

@main
struct FolioTellApp: App {

    var body: some Scene {
        DocumentGroup(viewing: FolioFileDocument.self) { configuration in
            ReaderRootView(
                loadedDocument: configuration.document.loadedDocument,
                documentPath: configuration.fileURL?.path(percentEncoded: false)
            )
        }
    }
}
