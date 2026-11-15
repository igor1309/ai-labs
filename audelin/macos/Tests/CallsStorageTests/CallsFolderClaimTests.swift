import CallsStorage
import Foundation
import Testing

@Suite struct CallsFolderClaimTests {

    @Test func aFreeFolderIsGranted() async throws {
        try await withStorageFolder { folder in
            let storage = makeStorage(folder: folder)
            guard case .granted = storage.takeFolder(for: .recording) else { Issue.record("refused"); return }
        }
    }

    @Test(arguments: [CallsFolderHolder.recording, .move, .relaunch], [CallsFolderHolder.recording, .move, .relaunch])
    func aHeldFolderIsRefusedWithItsHolder(_ holder: CallsFolderHolder, _ taker: CallsFolderHolder) async throws {
        try await withStorageFolder { folder in
            let storage = makeStorage(folder: folder)
            _ = storage.takeFolder(for: holder)
            #expect(storage.takeFolder(for: taker) == .refused(by: holder))
        }
    }

    @Test func twoTakesAtOnceGrantOne() async throws {
        try await withStorageFolder { folder in
            let storage = makeStorage(folder: folder)
            async let first = storage.takeFolder(for: .recording)
            async let second = storage.takeFolder(for: .move)
            let answers = await [first, second]
            #expect(answers.filter { if case .granted = $0 { true } else { false } }.count == 1)
        }
    }

    @Test func aReleaseFreesTheFolder() async throws {
        try await withStorageFolder { folder in
            let storage = makeStorage(folder: folder)
            guard case let .granted(token) = storage.takeFolder(for: .move) else { Issue.record("refused"); return }
            storage.releaseFolder(token)
            guard case .granted = storage.takeFolder(for: .recording) else { Issue.record("refused"); return }
        }
    }

    @Test func aStaleReleaseFreesNothing() async throws {
        try await withStorageFolder { folder in
            let storage = makeStorage(folder: folder)
            guard case let .granted(stale) = storage.takeFolder(for: .move) else { Issue.record("refused"); return }
            storage.releaseFolder(stale)
            _ = storage.takeFolder(for: .recording)
            storage.releaseFolder(stale)
            #expect(storage.takeFolder(for: .relaunch) == .refused(by: .recording))
        }
    }

    @Test func eachGrantHasANewToken() async throws {
        try await withStorageFolder { folder in
            let storage = makeStorage(folder: folder)
            guard case let .granted(first) = storage.takeFolder(for: .move) else { Issue.record("refused"); return }
            storage.releaseFolder(first)
            guard case let .granted(second) = storage.takeFolder(for: .move) else { Issue.record("refused"); return }
            #expect(first != second)
        }
    }
}
