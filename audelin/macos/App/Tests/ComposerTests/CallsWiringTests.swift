import BlockingTestWork
import CallsListUI
import Foundation
import Observation
import Preferences
import Recording
import Recordings
import Testing
@testable import Composer

/// The composed calls window over real folders on disk.
@MainActor
@Suite(.timeLimit(.minutes(1)))
struct CallsWiringTests {
    @Test func mappingNamesTheFailedCallAndProtectsOnlyTheRecording() {
        var state = RecordingsState()
        state.calls = [call("A"), call("B")]
        state.recordingID = "A"
        state.phase = .askingDelete("B")
        state.failure = .init(id: "B", reason: "disk denied")
        let mapped = callsListState(state, timeZone: .gmt)
        #expect(mapped.rows.map(\.editable) == [false, true])
        #expect(mapped.deleteID == "B")
        #expect(mapped.deleteBody?.contains("«B Zoom»") == true)
        #expect(mapped.failure == "«B»: disk denied")
        #expect(!mapped.busy)
        for phase: RecordingsState.Phase in [.renaming("A"), .deleting("B")] {
            state.phase = phase
            #expect(callsListState(state, timeZone: .gmt).busy)
            #expect(callsListState(state, timeZone: .gmt).deleteID == nil)
        }
    }

    @Test func menuOpeningListsAgainAndInlineRenameUsesAFreshResult() async throws {
        let shown = Values<Bool>()
        try await withComposition(presentCalls: { shown.append(true) }) { rig in
            let calls = try #require(rig.menu.calls)
            try await make("2024.01.01-1000 Zoom", in: rig.root)
            await rig.menu.perform(.showCalls)
            await wait(calls) { !$0.busy && $0.rows.map(\.title) == ["Zoom"] }
            #expect(shown.all.count == 1)
            await calls.send(.beginRename(a))
            #expect(calls.state.editing == .init(id: a, title: "Zoom"))
            await calls.send(.editTitle("Edited"))
            await calls.send(.cancelRename)
            #expect(calls.state.editing == nil)
            #expect(try await names(in: rig.root) == ["2024.01.01-1000 Zoom"])
            await calls.send(.beginRename(a))
            await calls.send(.editTitle("New"))
            await calls.send(.submitRename)
            await wait(calls) { !$0.busy && $0.rows.first?.title == "New" }
            #expect(try await names(in: rig.root) == ["2024.01.01-1000 New"])

            // Folders made since are found when the window opens again.
            try await make("2024.01.01-0900 Later", in: rig.root)
            await rig.menu.perform(.showCalls)
            await wait(calls) { !$0.busy && $0.rows.map(\.id) == [a, b] }
            #expect(shown.all.count == 2)
        }
    }

    @Test func deleteNeedsConfirmationAndAFailureRefreshesPartialDiskContents() async throws {
        try await withComposition { rig in
            let calls = try #require(rig.menu.calls)
            try await make("2024.01.01-1000 Zoom", in: rig.root)
            try await make("2024.01.01-0900 Other", in: rig.root)
            // A folder inside that cannot be emptied stops the delete partway.
            let stuck = rig.root.appendingPathComponent("2024.01.01-1000 Zoom/stuck")
            try await make("stuck", in: stuck.deletingLastPathComponent())
            try await make("kept", in: stuck)
            try await setMode(0o500, of: stuck)
            do {
                await rig.menu.perform(.showCalls)
                await wait(calls) { !$0.busy && $0.rows.map(\.id) == [a, b] }
                await calls.send(.askDelete(a))
                await wait(calls) { $0.deleteID == a }
                await calls.send(.cancelDelete)
                await wait(calls) { $0.deleteID == nil }
                #expect(try await names(in: rig.root).count == 2)

                await calls.send(.askDelete(a))
                await wait(calls) { $0.deleteID == a }
                // Only a fresh listing after the failure can show this one.
                try await make("2024.01.01-0800 New", in: rig.root)
                await calls.send(.confirmDelete)
                await wait(calls) { !$0.busy && $0.failure != nil && $0.rows.map(\.id) == [a, b, c] }
                #expect(calls.state.failure?.hasPrefix("«\(a)»: ") == true)

                // The reason stays until the next action.
                await calls.send(.open(b))
                await wait(calls) { $0.failure == "Не удалось открыть «\(b)» в Finder." }
                await calls.send(.askDelete(b))
                await wait(calls) { $0.deleteID == b }
                await calls.send(.confirmDelete)
                await wait(calls) { !$0.busy && $0.rows.map(\.id) == [a, c] }
                #expect(try await names(in: rig.root).sorted() == ["2024.01.01-0800 New", "2024.01.01-1000 Zoom"])
            } catch { try await setMode(0o700, of: stuck); throw error }
            try await setMode(0o700, of: stuck)
        }
    }

    /// The row asked about turned into the call being recorded: the question
    /// stays open, the folder stays on disk, and other calls can still change.
    @Test func recordingThatStartsAfterTheAskPreventsConfirmation() async throws {
        let id = "1970.01.01-0000"
        try await withComposition { rig in
            let calls = try #require(rig.menu.calls)
            try await make(id, in: rig.root)
            try await make("2024.01.01-0900 Other", in: rig.root)
            await rig.menu.perform(.showCalls)
            await wait(calls) { !$0.busy && $0.rows.count == 2 }
            await calls.send(.askDelete(id))
            await wait(calls) { $0.deleteID == id }

            // The listed folder goes away, so the recording's new folder takes its name.
            try await offPool { try FileManager.default.removeItem(at: rig.folder(id)) }
            try await rig.start()
            _ = try await rig.state { $0.callID == id }
            await calls.send(.confirmDelete)
            await wait(calls) { state in state.rows.first { $0.id == id }?.editable == false }
            #expect(calls.state.deleteID == id)
            #expect(await isFolder(rig.folder(id)))

            await calls.send(.cancelDelete)
            await wait(calls) { $0.deleteID == nil }
            await calls.send(.beginRename(id))
            #expect(calls.state.editing == nil)
            await calls.send(.beginRename(b))
            await calls.send(.editTitle("Renamed"))
            await calls.send(.submitRename)
            await wait(calls) { state in !state.busy && state.rows.first { $0.id == b }?.title == "Renamed" }
            try await rig.stop()
        }
    }

    @Test func openResolvesTheCurrentFolderAndReportsBothKindsOfFailure() async throws {
        let opened = Values<URL>()
        try await withComposition(openFolder: { opened.append($0); return false }) { rig in
            let calls = try #require(rig.menu.calls)
            try await make("2024.01.01-1000 Finder title", in: rig.root)
            await calls.send(.open(a))
            #expect(opened.all.map(\.lastPathComponent) == ["2024.01.01-1000 Finder title"])
            #expect(calls.state.failure == "Не удалось открыть «\(a)» в Finder.")
            await calls.send(.open("2024.01.01-0700"))
            #expect(opened.all.count == 1)
            #expect(calls.state.failure == "«2024.01.01-0700»: Звонок «2024.01.01-0700» больше не найден.")
        }
    }

    @Test func recordingIDStaysProtectedUntilCleanupEnds() {
        var state = RecordingState(missing: [])
        state = RecordingReducer.reduce(state, .userStart)
        let session = state.session!.id
        state = RecordingReducer.reduce(state, .sessionReported(id: session, .callCreated(id: "A")))
        #expect(recordedCallID(state) == "A")
        state = RecordingReducer.reduce(state, .sessionReported(id: session, .ready))
        #expect(recordedCallID(state) == "A")
        state = RecordingReducer.reduce(state, .userStop)
        #expect(recordedCallID(state) == "A")
        state = RecordingReducer.reduce(state, .sessionReported(id: session, .ended))
        #expect(recordedCallID(state) == nil)
        #expect(state.callID == nil)
        state = RecordingReducer.reduce(state, .sessionReported(id: session, .callCreated(id: "stale")))
        #expect(state.callID == nil)
    }
}

private let a = "2024.01.01-1000", b = "2024.01.01-0900", c = "2024.01.01-0800"

private func make(_ name: String, in folder: URL) async throws {
    let url = folder.appendingPathComponent(name)
    try await offPool { try FileManager.default.createDirectory(at: url, withIntermediateDirectories: false) }
}

private func setMode(_ mode: Int, of url: URL) async throws {
    try await offPool { try FileManager.default.setAttributes([.posixPermissions: mode], ofItemAtPath: url.path) }
}

/// The call folders in the calls folder, leaving out the preferences beside them.
private func names(in folder: URL) async throws -> [String] {
    try await offPool {
        try FileManager.default.contentsOfDirectory(atPath: folder.path).filter { $0.hasPrefix("20") }
    }
}

private func isFolder(_ url: URL) async -> Bool {
    await offPool { var folder: ObjCBool = false; return FileManager.default.fileExists(atPath: url.path, isDirectory: &folder) && folder.boolValue }
}

@MainActor
private func wait(_ calls: AudelinCalls, until predicate: (CallsListState) -> Bool) async {
    for await state in Observations({ calls.state }) where predicate(state) { return }
    Issue.record("Calls observation ended")
}
private func call(_ id: String, title: String = "Zoom") -> RecordedCall {
    .init(id: id, title: title, start: Date(timeIntervalSince1970: 0), duration: 72)
}
