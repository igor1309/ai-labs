import BlockingTestWork
import Composer
import Foundation
import Synchronization
import Testing

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct SessionFailureTests {
    @Test func aRemovedCallsFolderIsReportedWithoutStartingCaptures() async throws {
        try await withComposeFolder { root in
            let calls = root.appendingPathComponent("calls")
            try await offPool { try FileManager.default.createDirectory(at: calls, withIntermediateDirectories: false) }
            let reads = Mutex(0), startupRead = Signal()
            defer { startupRead.end() }
            let rig = try await ComposeFixture.make(root: root,
                preferences: .init(automaticRecording: false, liveText: false, callsFolder: calls), configure: { boundary in
                    boundary.capacity = FixtureCapacity(read: { _ in
                        let count = reads.withLock { $0 += 1; return $0 }
                        if count == 2 { startupRead.send() }
                        return Int64.max
                    })
                })
            do {
                await startupRead.next()
                try await offPool { try FileManager.default.removeItem(at: calls) }
                await rig.menu.perform(.start)
                let state = try await rig.state { $0.phase == .idle && $0.cannotRecord != nil }
                let expected = "folder: \(String(describing: POSIXError(.ENOENT) as NSError))"
                #expect(state.cannotRecord == expected)
                #expect(rig.microphone.starts.all.isEmpty && rig.call.starts.all.isEmpty)
                #expect(rig.log.entries.all.contains { $0.category == .recording && $0.error == expected })
                #expect(await offPool { !isFolder(calls.path) })
                await rig.finish()
            } catch { await rig.finish(); throw error }
        }
    }
}
