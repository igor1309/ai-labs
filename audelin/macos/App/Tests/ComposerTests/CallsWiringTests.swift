import Calls
import CallsListUI
import Foundation
import MenuBar
import Preferences
import Observation
import Recording
import Recordings
import Synchronization
import Testing
@testable import Audelin
@testable import Composer

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

    @Test func menuOpeningListsAgainAndInlineRenameUsesAFreshResult() async {
        let spy = CallsStoreSpy()
        spy.calls.withLock { $0 = [call("A")] }
        let shown = Counter()
        let controller = makeController(spy: spy, present: { shown.increment() })
        controller.show()
        await wait(controller) { !$0.busy && $0.rows.count == 1 }
        #expect(shown.value == 1)
        await controller.send(.beginRename("A"))
        #expect(controller.state.editing == .init(id: "A", title: "Zoom"))
        await controller.send(.editTitle("Edited"))
        await controller.send(.cancelRename)
        #expect(controller.state.editing == nil)
        #expect(spy.operations.withLock { $0 } == ["list"])
        await controller.send(.beginRename("A"))
        await controller.send(.editTitle("New"))
        await controller.send(.submitRename)
        await wait(controller) { !$0.busy && $0.rows.first?.title == "disk New" }
        #expect(spy.operations.withLock { $0 } == ["list", "rename A New", "list"])
        controller.show()
        await wait(controller) { !($0.busy) && spy.operations.withLock { $0.count } == 4 }
        #expect(shown.value == 2)
    }

    @Test func deleteNeedsConfirmationAndAFailureRefreshesPartialDiskContents() async {
        let spy = CallsStoreSpy()
        spy.calls.withLock { $0 = [call("A"), call("B")] }
        let controller = makeController(spy: spy)
        controller.show()
        await wait(controller) { !$0.busy && $0.rows.count == 2 }
        await controller.send(.askDelete("A"))
        await wait(controller) { $0.deleteID == "A" }
        #expect(spy.operations.withLock { $0 } == ["list"])
        await controller.send(.cancelDelete)
        await wait(controller) { $0.deleteID == nil }
        #expect(spy.operations.withLock { $0 } == ["list"])
        spy.failDelete.withLock { $0 = true }
        await controller.send(.askDelete("A"))
        await wait(controller) { $0.deleteID == "A" }
        await controller.send(.confirmDelete)
        await wait(controller) { !$0.busy && $0.rows.map(\.id) == ["B"] && $0.failure != nil }
        #expect(controller.state.failure == "«A»: disk")
        #expect(spy.operations.withLock { $0 } == ["list", "delete A", "list"])
        await controller.send(.open("B"))
        await wait(controller) { $0.failure == nil }
        await controller.send(.askDelete("B"))
        await wait(controller) { $0.deleteID == "B" }
        spy.failDelete.withLock { $0 = false }
        await controller.send(.confirmDelete)
        await wait(controller) { !$0.busy && $0.rows.isEmpty }
        #expect(spy.operations.withLock { $0 }.suffix(2) == ["delete B", "list"])
    }

    @Test func recordingThatStartsAfterTheAskPreventsConfirmation() async {
        let spy = CallsStoreSpy()
        spy.calls.withLock { $0 = [call("A"), call("B")] }
        let recording = RecordingHolder()
        let controller = makeController(spy: spy, recording: { recording.state })
        controller.show()
        await wait(controller) { !$0.busy && $0.rows.count == 2 }
        await controller.send(.askDelete("A"))
        await wait(controller) { $0.deleteID == "A" }
        recording.state.phase = .recording
        recording.state.callID = "A"
        await controller.send(.confirmDelete)
        await wait(controller) { $0.rows.first?.editable == false }
        #expect(controller.state.deleteID == "A")
        #expect(spy.operations.withLock { $0 } == ["list"])
        await controller.send(.cancelDelete)
        await wait(controller) { $0.deleteID == nil }
        await controller.send(.beginRename("B"))
        await controller.send(.editTitle("Other"))
        await controller.send(.submitRename)
        await wait(controller) { !$0.busy && $0.rows.last?.title == "disk Other" }
        #expect(spy.operations.withLock { $0 } == ["list", "rename B Other", "list"])
    }

    @Test func openResolvesTheCurrentFolderAndReportsBothKindsOfFailure() async {
        let spy = CallsStoreSpy()
        let opened = URLHolder()
        let controller = makeController(spy: spy, location: { id in
            if id == "gone" { throw DiskFailure() }
            return URL(fileURLWithPath: "/calls/\(id) Finder title")
        }, open: { opened.url = $0; return false })
        await controller.send(.open("A"))
        #expect(opened.url?.path == "/calls/A Finder title")
        #expect(controller.state.failure == "Не удалось открыть «A» в Finder.")
        await controller.send(.open("gone"))
        #expect(controller.state.failure == "«gone»: disk")
    }

    @Test func diskAdapterForwardsEachOperationAndMapsTheListing() async throws {
        let disk = DiskSpy()
        let adapter = ComposeCalls(disk: disk)
        #expect(try await adapter.list() == [call("A")])
        try await adapter.rename(id: "A", title: "New")
        try await adapter.delete(id: "B")
        #expect(try await adapter.location(id: "C").path == "/calls/C Finder")
        #expect(disk.operations.withLock { $0 } == ["list", "rename A New", "delete B", "location C"])
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

@MainActor
private func makeController(spy: CallsStoreSpy, recording: @escaping () -> RecordingState = { .init() },
                            location: @escaping (String) async throws -> URL = { URL(fileURLWithPath: "/calls/\($0)") },
                            open: @escaping (URL) -> Bool = { _ in true }, present: @escaping () -> Void = {}) -> AudelinCalls {
    AudelinCalls(inputs: makeRecordings(handler: .init(calls: spy)), timeZone: .gmt, recordingState: recording,
                 location: location, openFolder: open, present: present)
}

@MainActor
private func wait(_ controller: AudelinCalls, until predicate: (CallsListState) -> Bool) async {
    for await state in Observations({ controller.state }) where predicate(state) { return }
    Issue.record("Calls observation ended")
}
private func call(_ id: String, title: String = "Zoom") -> RecordedCall {
    .init(id: id, title: title, start: Date(timeIntervalSince1970: 0), duration: 72)
}
private struct DiskFailure: LocalizedError { var errorDescription: String? { "disk" } }
private final class CallsStoreSpy: RecordingsCalls, Sendable {
    let calls = Mutex<[RecordedCall]>([])
    let operations = Mutex<[String]>([])
    let failDelete = Mutex(false)
    func list() async throws -> [RecordedCall] { operations.withLock { $0.append("list") }; return calls.withLock { $0 } }
    func rename(id: String, title: String) async throws {
        operations.withLock { $0.append("rename \(id) \(title)") }
        calls.withLock { $0 = $0.map { $0.id == id ? call(id, title: "disk " + title) : $0 } }
    }
    func delete(id: String) async throws {
        operations.withLock { $0.append("delete \(id)") }
        calls.withLock { $0.removeAll { $0.id == id } }
        if failDelete.withLock({ $0 }) { throw DiskFailure() }
    }
}
private final class DiskSpy: CallsDisk, Sendable {
    let operations = Mutex<[String]>([])
    func list() throws -> [Calls.Call] {
        operations.withLock { $0.append("list") }
        return [.init(id: "A", title: "Zoom", start: Date(timeIntervalSince1970: 0), duration: 72)]
    }
    func rename(id: String, title: String) throws { operations.withLock { $0.append("rename \(id) \(title)") } }
    func delete(id: String) throws { operations.withLock { $0.append("delete \(id)") } }
    func location(id: String) throws -> URL {
        operations.withLock { $0.append("location \(id)") }
        return URL(fileURLWithPath: "/calls/\(id) Finder")
    }
}
@MainActor private final class Counter { var value = 0; func increment() { value += 1 } }
@MainActor private final class URLHolder { var url: URL? }
@MainActor private final class RecordingHolder { var state = RecordingState() }

private struct CallsPreferences: PreferenceSettingsStorage {
    func read() -> Preferences { .init() }
    func write(_ preferences: Preferences) throws { Issue.record("Calls window does not change preferences") }
}
private struct CallsLog: LogSink {
    let entries = Values<LogEntry>()
    func write(_ entry: LogEntry) { entries.append(entry) }
}
