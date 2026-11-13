import BlockingTestWork
import CallFolder
import Calls
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
    @Test func callsReadTranscriptLinesThroughTranscriptFormatWithWordsAsWritten() {
        let markdown = "# Transcript\n\n**Me** 00:00:05\nпо OKR\\_2 и *да*\n\n**Them 1** 01:02:03 (filled in later)\nСогласен\n"
        #expect(SummaryStorage.transcriptLines(markdown) == [
            .init(start: 5, words: "по OKR\\_2 и *да*", label: "Me"),
            .init(start: 3_723, words: "Согласен", label: "Them 1"),
        ])
    }

    @Test func mappingNamesTheFailedCallAndProtectsOnlyTheRecording() {
        var state = RecordingsState()
        state.calls = [call("A"), call("B")]
        state.recordingID = "A"
        state.phase = .askingDelete("B")
        state.failure = .init(id: "B", reason: "disk denied")
        let mapped = callsListState(state, timeZone: .gmt, now: .distantFuture, text: .init(language: .russian))
        #expect(mapped.rows.map(\.editable) == [false, true])
        #expect(mapped.deleteID == "B")
        #expect(mapped.deleteBody == "«B Zoom»: вся папка звонка — аудио, расшифровки и саммари — переместится в Корзину.")
        #expect(mapped.failure == "«B»: disk denied")
        #expect(!mapped.busy)
        for phase: RecordingsState.Phase in [.renaming("A"), .deleting("B")] {
            state.phase = phase
            #expect(callsListState(state, timeZone: .gmt, now: .distantFuture, text: .init(language: .russian)).busy)
            #expect(callsListState(state, timeZone: .gmt, now: .distantFuture, text: .init(language: .russian)).deleteID == nil)
            #expect(callsListState(state, timeZone: .gmt, now: .distantFuture, text: .init(language: .russian)).deleteBody == nil)
        }
    }

    @Test func mappingOpensEachDayWithItsHeaderAndCount() {
        let hour = 3_600.0, now = Date(timeIntervalSince1970: 3 * 24 * hour + 20 * hour)
        var state = RecordingsState()
        state.calls = [(3, 18), (3, 9), (2, 23), (2, 10), (2, 8), (0, 12)].map { day, hour in
            .init(id: "\(day)-\(hour)", title: "", start: Date(timeIntervalSince1970: (Double(day) * 24 + Double(hour)) * 3_600), duration: 75)
        }
        let rows = callsListState(state, timeZone: .gmt, now: now, text: .init(language: .russian)).rows
        #expect(rows.map(\.day) == [.init(title: "Сегодня", count: "2 звонка"), nil,
                                     .init(title: "Вчера", count: "3 звонка"), nil, nil,
                                     .init(title: "Четверг, 1 января", count: "1 звонок")])
        #expect(rows.map(\.time) == ["18:00", "09:00", "23:00", "10:00", "08:00", "12:00"])
        #expect(rows.map(\.duration) == Array(repeating: "1:15", count: 6))
        #expect(rows.last?.displayTitle == "1970.01.01-1200")
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

    @Test func selectingAnotherCallSavesTheRenameUnderWay() async throws {
        try await withComposition { rig in
            let calls = try #require(rig.menu.calls)
            try await make("2024.01.01-1000 Zoom", in: rig.root)
            try await make("2024.01.01-0900 Meet", in: rig.root)
            await rig.menu.perform(.showCalls)
            await wait(calls) { !$0.busy && $0.rows.count == 2 }
            await calls.send(.beginRename(a))
            await calls.send(.editTitle("Picked"))
            await calls.send(.select(b))
            #expect(calls.state.editing == nil)
            #expect(calls.state.selectedID == b)
            await wait(calls) { state in !state.busy && state.rows.first { $0.id == a }?.title == "Picked" }

            await calls.send(.beginRename(b))
            await calls.send(.editTitle("Moved"))
            await calls.send(.selectPrevious)
            await wait(calls) { state in !state.busy && state.rows.first { $0.id == b }?.title == "Moved" }
            #expect(try await names(in: rig.root) == ["2024.01.01-0900 Moved", "2024.01.01-1000 Picked"])
        }
    }

    @Test func deleteNeedsConfirmationMovesToTheTrashAndAFailureLeavesTheFolder() async throws {
        let trashed = Values<String>()
        try await withComposition(configure: { boundary in
            boundary.trash = { url in
                trashed.append(url.lastPathComponent)
                // No Trash on the call's volume: the folder stays whole.
                if url.lastPathComponent.hasPrefix(a) { throw CocoaError(.featureUnsupported) }
                try FileManager.default.removeItem(at: url)
            }
        }) { rig in
            let calls = try #require(rig.menu.calls)
            try await make("2024.01.01-1000 Zoom", in: rig.root)
            try await make("2024.01.01-0900 Other", in: rig.root)
            try await make("kept", in: rig.root.appendingPathComponent("2024.01.01-1000 Zoom"))
            await rig.menu.perform(.showCalls)
            await wait(calls) { !$0.busy && $0.rows.map(\.id) == [a, b] }
            await calls.send(.askDelete(a))
            await wait(calls) { $0.deleteID == a }
            #expect(calls.state.deleteBody == "«\(a) Zoom»: вся папка звонка — аудио, расшифровки и саммари — переместится в Корзину.")
            await calls.send(.cancelDelete)
            await wait(calls) { $0.deleteID == nil }
            #expect(trashed.all.isEmpty)

            await calls.send(.askDelete(a))
            await wait(calls) { $0.deleteID == a }
            // Only a fresh listing after the failure can show this one.
            try await make("2024.01.01-0800 New", in: rig.root)
            await calls.send(.confirmDelete)
            await wait(calls) { !$0.busy && $0.failure != nil && $0.rows.map(\.id) == [a, b, c] }
            #expect(calls.state.failure == "«\(a)»: Не удалось переместить «2024.01.01-1000 Zoom» в Корзину; папка осталась на месте. \(CocoaError(.featureUnsupported).localizedDescription)")
            #expect(await isFolder(rig.root.appendingPathComponent("2024.01.01-1000 Zoom/kept")))

            // The reason stays until the next action.
            await calls.send(.open(b))
            await wait(calls) { $0.failure == "Не удалось открыть «\(b)» в Finder." }
            await calls.send(.askDelete(b))
            await wait(calls) { $0.deleteID == b }
            await calls.send(.confirmDelete)
            await wait(calls) { !$0.busy && $0.rows.map(\.id) == [a, c] }
            #expect(trashed.all == ["2024.01.01-1000 Zoom", "2024.01.01-0900 Other"])
            #expect(try await names(in: rig.root).sorted() == ["2024.01.01-0800 New", "2024.01.01-1000 Zoom"])
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
            try FileManager.default.removeItem(at: rig.folder(id))
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

    /// What the writers really make is what protects the call being recorded.
    @Test func madeAndRenamedNamesReadBackAsTheSameCall() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("CallsWiringTests-\(UUID())", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: false)
        try await withCleanup {
            let calls = Calls(folder: root, timeZone: .gmt, duration: { _ in 0 }, transcript: { _ in [] }, disk: .system)
            let cases: [(minute: Double, made: String?, id: String, title: String)] = [
                (0, "Zoom", "1970.01.01-0000", "Zoom"),
                (0, "Zoom", "1970.01.01-0000-2", "Zoom"),
                (0, "Meet", "1970.01.01-0000-3", "Meet"),
                (1, "a/b:c", "1970.01.01-0001", "a-b-c"),
                (2, "", "1970.01.01-0002", ""),
                (3, nil, "1970.01.01-0003", ""),
            ]
            for item in cases {
                let folder = CallFolder(callsURL: root, now: { Date(timeIntervalSince1970: item.minute * 60) }, timeZone: .gmt, occupiedNames: { [] }, disk: .system)
                let name = try folder.make(title: item.made).url.lastPathComponent
                #expect(Calls.id(in: name, timeZone: .gmt) == item.id)
                #expect(try calls.list().first { $0.id == item.id }?.title == item.title)
            }
            let id = "1970.01.01-0000-2"
            for (title, shown) in [("New", "New"), ("x/y:z", "x-y-z"), ("", "")] {
                try calls.rename(id: id, title: title)
                let name = try calls.location(id: id).lastPathComponent
                #expect(Calls.id(in: name, timeZone: .gmt) == id)
                #expect(try calls.list().first { $0.id == id }?.title == shown)
            }
        } cleanup: {
            try FileManager.default.removeItem(at: root)
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
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: false)
}

private func setMode(_ mode: Int, of url: URL) async throws {
    try FileManager.default.setAttributes([.posixPermissions: mode], ofItemAtPath: url.path)
}

/// The call folders in the calls folder, leaving out the preferences beside them.
private func names(in folder: URL) async throws -> [String] {
    try FileManager.default.contentsOfDirectory(atPath: folder.path).filter { $0.hasPrefix("20") }
}

private func isFolder(_ url: URL) async -> Bool {
    var folder: ObjCBool = false; return FileManager.default.fileExists(atPath: url.path, isDirectory: &folder) && folder.boolValue
}

@MainActor
private func wait(_ calls: AudelinCalls, until predicate: (CallsListState) -> Bool) async {
    for await state in Observations({ calls.state }) where predicate(state) { return }
    Issue.record("Calls observation ended")
}
private func call(_ id: String, title: String = "Zoom") -> RecordedCall {
    .init(id: id, title: title, start: Date(timeIntervalSince1970: 0), duration: 72)
}
