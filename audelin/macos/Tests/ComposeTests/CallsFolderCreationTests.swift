import Foundation
import Testing
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct CallsFolderCreationTests {

    @Test func onlyTheDefaultFolderIsCreated() async throws {

        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("calls-folder-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let defaultFolder = root.appendingPathComponent("Recordings/Audelin", isDirectory: true)
        let chosen = root.appendingPathComponent("Chosen", isDirectory: true)

        await createDefaultCallsFolder(chosen, default: defaultFolder)
        await createDefaultCallsFolder(defaultFolder, default: defaultFolder)

        #expect(!FileManager.default.fileExists(atPath: chosen.path))
        var isDirectory: ObjCBool = false
        #expect(FileManager.default.fileExists(atPath: defaultFolder.path, isDirectory: &isDirectory))
        #expect(isDirectory.boolValue)
    }
}
