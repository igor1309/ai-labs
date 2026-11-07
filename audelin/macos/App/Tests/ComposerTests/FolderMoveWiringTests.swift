import BlockingTestWork
import Foundation
import Observation
import Recording
import Recordings
import SettingsUI
import Testing
@testable import Composer

@MainActor @Suite(.timeLimit(.minutes(1)))
struct FolderMoveWiringTests {
    @Test func settingsMapsConfirmationProgressFailureAndRefusal() {
        var state = RecordingsState(callsFolder: URL(fileURLWithPath: "/old"))
        let text = MoveText(title: "Confirm title", body: "52 calls · 135 MB", detail: "31 of 52 · 100 MB of 135 MB", moved: "31 of 52")
        state.move = .init(destination: URL(fileURLWithPath: "/new"), remaining: [.init(id: "A", title: "Zoom", bytes: 7)],
                           totalCalls: 52, totalBytes: 135_000_000, movedBytes: 100_000_000, progress: 31.0 / 52, text: text)
        var screen = SettingsState(recordsCalls: false, liveText: false, folder: .init(path: "/old", status: .idle(calls: "")), engines: [], selectedEngine: nil, explainKeys: "")
        state.phase = .askingMove
        applyFolderMove(state, to: &screen)
        #expect(screen.moveConfirm == .init(title: text.title, body: text.body))
        state.phase = .moving
        applyFolderMove(state, to: &screen)
        #expect(screen.folder.status == .moving(done: 31.0 / 52, detail: text.detail))
        state.phase = .failedMove; state.failure = .init(id: "A", reason: "disk full")
        applyFolderMove(state, to: &screen)
        #expect(screen.folder.path == "/old")
        #expect(screen.folder.status == .failed(moved: text.moved, reason: "«A Zoom»: disk full"))
        state.phase = .refusedMove
        applyFolderMove(state, to: &screen)
        #expect(screen.folder.status == .recording)
    }

    @Test func composedMoveHoldsAStartUntilReleaseAndRefreshesTheList() async throws {
        try await withComposition { rig in
            let spy = CallsMoveSpy()
            let inputs = makeRecordings(handler: .init(calls: spy,
                reserve: { await rig.menu.reserveCallsFolder() },
                release: { await rig.menu.releaseCallsFolder() }, storeFolder: { await spy.store($0) }),
                initial: .init(callsFolder: rig.root))
            let calls = AudelinCalls(inputs: inputs, timeZone: .gmt, recordingState: { rig.menu.state },
                                    location: { _ in rig.root }, openFolder: { _ in true }, present: {})
            rig.menu.installCalls(calls)
            let destination = rig.root.appendingPathComponent("new")
            calls.sendRecordings(.chooseFolder(destination))
            await wait(inputs) { $0.phase == .askingMove }
            #expect(rig.menu.settingsState.moveConfirm?.body.contains("2") == true)
            #expect(rig.menu.settingsState.moveConfirm?.body.contains(destination.path) == true)
            calls.sendRecordings(.confirmMove)
            await spy.waitForMove()
            #expect(await spy.moved == ["A"])
            #expect(!inputs.state().callsFolderAvailable)
            let reserved = try await rig.state { $0.storageReserved && $0.missing.contains(.callsFolder) }
            #expect(reserved.phase == .idle)
            await rig.menu.perform(.start)
            let held = try await rig.state { $0.pendingStart == .hand }
            #expect(held.phase == .idle)
            #expect(rig.microphone.starts.all.isEmpty && rig.call.starts.all.isEmpty)
            await spy.completeMove()
            await spy.waitForMove()
            await wait(inputs) { $0.move?.completed.count == 1 }
            #expect(inputs.state().move?.movedBytes == 3)
            #expect(await spy.moved == ["A", "B"])
            #expect(await spy.stored.isEmpty)
            await spy.completeMove()
            await wait(inputs) { $0.phase == .idle && !$0.isListing }
            _ = try await rig.state { $0.phase == .recording }
            #expect(inputs.state().callsFolderAvailable)
            #expect(inputs.state().calls.map(\.id) == ["fresh"])
            #expect(await spy.stored == [destination])
            #expect(await spy.listings == 1)
            try await rig.stop()
        }
    }

    @Test func aFailedMoveReleasesTheHeldStartKeepsTheSettingAndRetriesTheRest() async throws {
        try await withComposition { rig in
            let spy = CallsMoveSpy()
            let inputs = makeRecordings(handler: .init(calls: spy,
                reserve: { await rig.menu.reserveCallsFolder() },
                release: { await rig.menu.releaseCallsFolder() }, storeFolder: { await spy.store($0) }),
                initial: .init(callsFolder: rig.root))
            let calls = AudelinCalls(inputs: inputs, timeZone: .gmt, recordingState: { rig.menu.state },
                                    location: { _ in rig.root }, openFolder: { _ in true }, present: {})
            rig.menu.installCalls(calls)
            let destination = rig.root.appendingPathComponent("new")
            calls.sendRecordings(.chooseFolder(destination))
            await wait(inputs) { $0.phase == .askingMove }
            calls.sendRecordings(.confirmMove)
            await spy.waitForMove()
            await spy.completeMove()
            await spy.waitForMove()
            await rig.menu.perform(.start)
            _ = try await rig.state { $0.pendingStart == .hand }
            await spy.failMove()
            await wait(inputs) { $0.phase == .failedMove && !$0.isListing }
            _ = try await rig.state { $0.phase == .recording }
            #expect(inputs.state().callsFolderAvailable)
            #expect(inputs.state().move?.completed.map(\.id) == ["A"])
            #expect(inputs.state().failure == .init(id: "B", reason: "disk"))
            #expect(rig.menu.preferences.callsFolder == rig.root)
            #expect(await spy.stored.isEmpty)
            try await rig.stop()
            await wait(inputs) { $0.recordingID == nil }
            calls.sendRecordings(.retryMove)
            await wait(inputs) { $0.phase == .moving }
            try #require(inputs.state().phase == .moving)
            await spy.waitForMove()
            #expect(await spy.moved == ["A", "B", "B"])
            await spy.completeMove()
            await wait(inputs) { $0.phase == .idle && !$0.isListing }
            #expect(await spy.stored == [destination])
        }
    }

    @Test func pickerMovesRealCallsThenNewRecordingsUseTheStoredFolder() async throws {
        try await withComposeFolder { root in
            let destination = root.appendingPathComponent("new")
            let a = "2026.10.24-1405 Zoom", b = "2026.10.25-1405"
            try await offPool {
                for path in [root.appendingPathComponent(a), root.appendingPathComponent(b), destination] {
                    try FileManager.default.createDirectory(at: path, withIntermediateDirectories: true)
                }
                try Data([1, 2, 3]).write(to: root.appendingPathComponent(a + "/audio"))
                try Data([4, 5, 6, 7]).write(to: root.appendingPathComponent(b + "/transcript.md"))
            }
            let rig = try await ComposeFixture.make(root: root)
            do {
                var picks = 0
                rig.menu.installFolderPicker { picks += 1; return destination }
                await rig.menu.sendSettings(.changeFolder)
                for await state in Observations({ rig.menu.settingsState }) where state.moveConfirm != nil { break }
                #expect(picks == 1)
                #expect(rig.menu.settingsState.moveConfirm?.body.contains("2") == true)
                #expect(rig.menu.settingsState.moveConfirm?.body.contains("7") == true)
                await rig.menu.sendSettings(.cancelMove)
                for await state in Observations({ rig.menu.settingsState }) where state.moveConfirm == nil { break }
                #expect(await offPool { FileManager.default.fileExists(atPath: root.appendingPathComponent(a).path) })
                await rig.menu.sendSettings(.changeFolder)
                for await state in Observations({ rig.menu.settingsState }) where state.moveConfirm != nil { break }
                await rig.menu.sendSettings(.confirmMove)
                for await state in Observations({ rig.menu.settingsState }) where state.folder.path == destination.path {
                    if case .idle = state.folder.status { break }
                }
                #expect(rig.menu.preferences.callsFolder == destination)
                #expect(try await offPool { try Data(contentsOf: destination.appendingPathComponent(a + "/audio")) } == Data([1, 2, 3]))
                #expect(try await offPool { try Data(contentsOf: destination.appendingPathComponent(b + "/transcript.md")) } == Data([4, 5, 6, 7]))
                try await rig.start()
                #expect(await offPool { FileManager.default.fileExists(atPath: destination.appendingPathComponent("1970.01.01-0000").path) })
                try await rig.stop()
                await rig.finish()
            } catch { await rig.finish(); throw error }
        }
    }
}

@MainActor private func wait(_ inputs: RecordingsInputs, until predicate: (RecordingsState) -> Bool) async {
    for await state in Observations({ inputs.state() }) where predicate(state) { return }
}
private actor CallsMoveSpy: RecordingsCalls {
    private(set) var moved: [String] = []
    private(set) var stored: [URL] = []
    private(set) var listings = 0
    private var result: CheckedContinuation<Int64, any Error>?
    private var started: CheckedContinuation<Void, Never>?
    func prepareMove() -> [MoveCall] { [.init(id: "B", title: "Newer", bytes: 7), .init(id: "A", title: "Older", bytes: 3)] }
    func move(id: String, to: URL) async throws -> Int64 {
        moved.append(id)
        return try await withCheckedThrowingContinuation { result = $0; started?.resume(); started = nil }
    }
    func waitForMove() async { if result == nil { await withCheckedContinuation { started = $0 } } }
    func completeMove() { let bytes: Int64 = moved.last == "A" ? 3 : 7; result?.resume(returning: bytes); result = nil }
    func failMove() { result?.resume(throwing: MoveFailure()); result = nil }
    func store(_ destination: URL) { stored.append(destination) }
    func list() -> [RecordedCall] { listings += 1; return [.init(id: "fresh", title: "Fresh", start: .distantPast, duration: nil)] }
    func rename(id: String, title: String) { Issue.record("Unexpected rename") }
    func delete(id: String) { Issue.record("Unexpected delete") }
}

private struct MoveFailure: LocalizedError { var errorDescription: String? { "disk" } }
