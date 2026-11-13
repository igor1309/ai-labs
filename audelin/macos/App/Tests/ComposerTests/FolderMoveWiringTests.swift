import BlockingTestWork
import Calls
import Foundation
import Observation
import Recording
import Recordings
import SettingsUI
import Testing
@testable import Composer

@MainActor @Suite(.timeLimit(.minutes(1)))
struct FolderMoveWiringTests {
    @Test func singleRootPreparationExcludesTheDestinationIncludingItsSymlink() async throws {
        try await withComposeFolder { root in
            let source = root.appendingPathComponent("source"), alias = root.appendingPathComponent("alias")
            let id = "1970.01.01-0000"
            do {
                try FileManager.default.createDirectory(at: source.appendingPathComponent(id), withIntermediateDirectories: true)
                try Data([1, 2, 3]).write(to: source.appendingPathComponent(id + "/audio"))
                try FileManager.default.createSymbolicLink(at: alias, withDestinationURL: source)
            }
            let calls = ComposeCalls(disk: Calls(folder: source, timeZone: .gmt, duration: { _ in 0 }, transcript: { _ in [] }, disk: .system))
            #expect(try await calls.prepareMove(to: source).isEmpty)
            #expect(try await calls.prepareMove(to: alias).isEmpty)
            #expect(try await calls.prepareMove(to: root) == [.init(id: id, title: "", bytes: 3)])
        }
    }

    @Test func settingsMapsConfirmationProgressFailureAndRefusal() {
        var state = RecordingsState(callsFolder: URL(fileURLWithPath: "/old"))
        let text = MoveText(title: "Confirm title", body: "52 calls · 135 MB", detail: "31 of 52 · 100 MB of 135 MB", moved: "31 of 52")
        state.move = .init(destination: URL(fileURLWithPath: "/new"), remaining: [.init(id: "A", title: "Zoom", bytes: 7)],
                           totalCalls: 52, totalBytes: 135_000_000, movedBytes: 100_000_000, progress: 31.0 / 52, text: text)
        var screen = SettingsState(recordsCalls: false, liveText: false, folder: .init(path: "/old", status: .idle(calls: "")), engines: [], selectedEngine: nil, explainKeys: "")
        state.phase = .askingMove
        applyFolderMove(state, text: SettingsText(language: .russian), to: &screen)
        #expect(screen.moveConfirm == .init(title: text.title, body: text.body))
        state.phase = .moving
        applyFolderMove(state, text: SettingsText(language: .russian), to: &screen)
        #expect(screen.folder.status == .moving(done: 31.0 / 52, detail: text.detail))
        state.phase = .failedMove; state.failure = .init(id: "A", reason: "disk full")
        applyFolderMove(state, text: SettingsText(language: .russian), to: &screen)
        #expect(screen.folder.path == "/old")
        #expect(screen.folder.status == .failed(moved: text.moved, reason: "«A Zoom»: disk full"))
        state.phase = .refusedMove
        applyFolderMove(state, text: SettingsText(language: .russian), to: &screen)
        #expect(screen.folder.status == .recording)
    }

    @Test(arguments: SettingsLanguage.allCases)
    nonisolated func moveTextNamesTheDestinationCountsAndSizesInTheLanguage(language: SettingsLanguage) {
        let text = SettingsText(language: language)
        let size = { (bytes: Int64) in text.size(bytes) }
        let destination = URL(fileURLWithPath: "/destination")
        let one = MoveCall(id: "A", title: "", bytes: 3)
        let moveText = folderMoveText { text }
        let single = moveText(.init(destination: destination, completed: [one], totalCalls: 1, totalBytes: 3, movedBytes: 3))
        let many = moveText(.init(destination: destination, completed: [one], totalCalls: 2, totalBytes: 10, movedBytes: 3))
        switch language {
        case .russian:
            #expect(single == MoveText(title: "Перенести звонки: 1 (\(size(3)))?",
                                       body: "Звонков: 1, \(size(3)). В /destination. Во время переноса запись не начнётся.",
                                       detail: "Звонков: 1 из 1 · \(size(3)) из \(size(3))", moved: "Перенесено звонков: 1 из 1"))
            #expect(many.title == "Перенести звонки: 2 (\(size(10)))?")
            #expect(many.moved == "Перенесено звонков: 1 из 2")
        case .english:
            #expect(single == MoveText(title: "Move 1 call (\(size(3)))?",
                                       body: "1 call, \(size(3)). To /destination. Recording won’t start during the move.",
                                       detail: "Calls: 1 of 1 · \(size(3)) of \(size(3))", moved: "Moved 1 of 1 call"))
            #expect(many.title == "Move 2 calls (\(size(10)))?")
            #expect(many.body.hasPrefix("2 calls, "))
            #expect(many.moved == "Moved 1 of 2 calls")
        }
        #expect(text.size(10) != "")
        #expect(SettingsText(language: .russian).size(2_000_000).contains("МБ"))
        #expect(SettingsText(language: .english).size(2_000_000).contains("MB"))
    }

    @Test func countingAndRefreshingLinesComeFromTheGivenText() {
        var state = RecordingsState(callsFolder: URL(fileURLWithPath: "/old"))
        state.move = .init(destination: URL(fileURLWithPath: "/new"))
        var screen = SettingsState(recordsCalls: false, liveText: false, folder: .init(path: "/old", status: .idle(calls: "")), engines: [], selectedEngine: nil, explainKeys: "")
        state.phase = .countingMove
        applyFolderMove(state, text: SettingsText(language: .english), to: &screen)
        #expect(screen.folder.status == .moving(done: 0, detail: "Counting calls…"))
        state.phase = .failedMove; state.isListing = true
        applyFolderMove(state, text: SettingsText(language: .english), to: &screen)
        #expect(screen.folder.status == .moving(done: 0, detail: "Updating the calls list…"))
    }

    @Test func composedMoveHoldsAStartUntilReleaseAndRefreshesTheList() async throws {
        try await withComposition { rig in
            let spy = CallsMoveSpy()
            let inputs = makeRecordings(handler: .init(calls: spy,
                reserve: { await rig.menu.reserveCallsFolder() },
                release: { await rig.menu.releaseCallsFolder() }, storeFolder: { await spy.store($0) }, describe: russianSettings.callsFailure),
                text: russianSettingsText, initial: .init(callsFolder: rig.root))
            let calls = AudelinCalls(inputs: inputs, timeZone: .gmt, now: Date.init, recordingState: { rig.menu.state },
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
                release: { await rig.menu.releaseCallsFolder() }, storeFolder: { await spy.store($0) }, describe: russianSettings.callsFailure),
                text: russianSettingsText, initial: .init(callsFolder: rig.root))
            let calls = AudelinCalls(inputs: inputs, timeZone: .gmt, now: Date.init, recordingState: { rig.menu.state },
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

    @Test(arguments: [false, true])
    func partialMoveReservesMovedIDsForANewRecordingInTheSameMinuteAndRetryCompletes(destinationOffline: Bool) async throws {
        try await withComposeFolder { root in
            let destination = root.appendingPathComponent("new")
            let a = "1970.01.01-0000", b = "1970.01.01-0000-2", fresh = "1970.01.01-0000-3"
            do {
                for path in [root.appendingPathComponent(a), root.appendingPathComponent(b), destination] {
                    try FileManager.default.createDirectory(at: path, withIntermediateDirectories: true)
                }
                try Data([1, 2, 3]).write(to: root.appendingPathComponent(a + "/audio"))
                try Data([4, 5, 6, 7]).write(to: root.appendingPathComponent(b + "/transcript.md"))
                try Data([99]).write(to: destination.appendingPathComponent(b))
            }
            let rig = try await ComposeFixture.make(root: root)
            do {
                let calls = try #require(rig.menu.calls)
                calls.sendRecordings(.chooseFolder(destination))
                for await state in Observations({ calls.recordingsState }) where state.phase == .askingMove { break }
                calls.sendRecordings(.confirmMove)
                for await state in Observations({ calls.recordingsState }) where state.phase == .failedMove && !state.isListing { break }
                #expect(calls.recordingsState.move?.completed.map(\.id) == [a])
                #expect(calls.recordingsState.failure?.id == b)
                #expect(rig.menu.preferences.callsFolder == root)
                let offline = root.appendingPathComponent("offline")
                if destinationOffline {
                    try FileManager.default.moveItem(at: destination, to: offline)
                }
                try await rig.start()
                #expect(FileManager.default.fileExists(atPath: root.appendingPathComponent(fresh).path))
                #expect(!FileManager.default.fileExists(atPath: root.appendingPathComponent(a).path))
                try await rig.stop()
                for await state in Observations({ calls.recordingsState }) where state.recordingID == nil && !state.isListing { break }
                if destinationOffline {
                    #expect(rig.menu.preferences.callsFolder == root)
                    #expect(try Data(contentsOf: offline.appendingPathComponent(a + "/audio")) == Data([1, 2, 3]))
                    try FileManager.default.moveItem(at: offline, to: destination)
                }
                try FileManager.default.removeItem(at: destination.appendingPathComponent(b))
                calls.sendRecordings(.retryMove)
                for await state in Observations({ calls.recordingsState }) where state.phase == .idle && !state.isListing { break }
                #expect(rig.menu.preferences.callsFolder == destination)
                #expect(calls.recordingsState.calls.map(\.id) == [fresh, b, a])
                #expect(try Data(contentsOf: destination.appendingPathComponent(a + "/audio")) == Data([1, 2, 3]))
                #expect(try Data(contentsOf: destination.appendingPathComponent(b + "/transcript.md")) == Data([4, 5, 6, 7]))
                #expect(FileManager.default.fileExists(atPath: destination.appendingPathComponent(fresh + "/transcript.md").path))
                await rig.finish()
            } catch { await rig.finish(); throw error }
        }
    }

    @Test func pickerMovesRealCallsThenNewRecordingsUseTheStoredFolder() async throws {
        try await withComposeFolder { root in
            let destination = root.appendingPathComponent("new")
            let a = "2026.10.24-1405 Zoom", b = "2026.10.25-1405"
            do {
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
                #expect(FileManager.default.fileExists(atPath: root.appendingPathComponent(a).path))
                await rig.menu.sendSettings(.changeFolder)
                for await state in Observations({ rig.menu.settingsState }) where state.moveConfirm != nil { break }
                await rig.menu.sendSettings(.confirmMove)
                for await state in Observations({ rig.menu.settingsState }) where state.folder.path == destination.path {
                    if case .idle = state.folder.status { break }
                }
                #expect(rig.menu.preferences.callsFolder == destination)
                #expect(try Data(contentsOf: destination.appendingPathComponent(a + "/audio")) == Data([1, 2, 3]))
                #expect(try Data(contentsOf: destination.appendingPathComponent(b + "/transcript.md")) == Data([4, 5, 6, 7]))
                try await rig.start()
                #expect(FileManager.default.fileExists(atPath: destination.appendingPathComponent("1970.01.01-0000").path))
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
    func prepareMove(to destination: URL) -> [MoveCall] { [.init(id: "B", title: "Newer", bytes: 7), .init(id: "A", title: "Older", bytes: 3)] }
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

@Sendable private func russianSettingsText() -> SettingsText { SettingsText(language: .russian) }
