import BlockingTestWork
import Foundation
import Testing
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct CallsFolderCreationTests {

    @Test func onlyTheDefaultFolderIsCreated() async throws {

        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("calls-folder-\(UUID().uuidString)", isDirectory: true)
        let defaultFolder = root.appendingPathComponent("Recordings/Audelin", isDirectory: true)
        let chosen = root.appendingPathComponent("Chosen", isDirectory: true)

        try await withCleanup {
            await createDefaultCallsFolder(chosen, default: defaultFolder)
            await createDefaultCallsFolder(defaultFolder, default: defaultFolder)

            #expect(await offPool { !FileManager.default.fileExists(atPath: chosen.path) })
            #expect(await offPool { isFolder(defaultFolder.path) })
        } cleanup: {
            try FileManager.default.removeItem(at: root)
        }
    }
}
