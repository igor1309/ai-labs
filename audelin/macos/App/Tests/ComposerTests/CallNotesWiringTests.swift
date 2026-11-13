import BlockingTestWork
import CallsListUI
import Foundation
import Observation
import Preferences
import SummaryFiles
import SummaryRuntime
import Synchronization
import Testing
@testable import Composer

/// Integrates the shipped composer, calls storage and controlled generation.
@MainActor @Suite(.timeLimit(.minutes(1)))
struct CallNotesWiringTests {
    @Test(arguments: [false, true])
    func requestedNotesWorkWithAutomaticNotesOff(fromDetail: Bool) async throws {
        try await withNotesComposition { rig, http in
            let calls = try #require(rig.menu.calls)
            try savedCall(a, in: rig.root)
            await rig.menu.perform(.showCalls)
            await rows(calls, count: 1)
            try #require(calls.state.rows[0].canMakeSummary)
            await calls.send(.read(a))
            if fromDetail { await calls.send(detail: .makeSummary) }
            else { await calls.send(.makeSummary(a)) }
            await http.started.next()
            await detail(calls) { $0?.content == .preparing }
            #expect(!calls.state.rows[0].canMakeSummary)
            await calls.send(.makeSummary(a)); await calls.send(detail: .makeSummary)
            #expect(await http.bodies.count == 1)
            try await http.succeed()
            await detail(calls) { if case .notes = $0?.content { true } else { false } }
            if case let .notes(text, made) = calls.detail?.content {
                #expect(text == generatedNotes)
                let file = rig.folder(a).appendingPathComponent("summary.md")
                let modified = try #require(try FileManager.default.attributesOfItem(atPath: file.path)[.modificationDate] as? Date)
                #expect(made == modified.formatted(Date.FormatStyle(date: .abbreviated, time: .shortened, locale: Locale(identifier: "ru_RU"), timeZone: .gmt)))
            } else { Issue.record("missing completed notes") }
            #expect(await http.bodies.first?.contains("[3.0] Me: saved words") == true)
            #expect(await http.bodies.first?.contains("configured-model") == true)
            #expect(!calls.state.rows[0].canMakeSummary)
        }
    }

    @Test func cancelDiscardsOnlyThatAttemptAndAllowsMakingAgain() async throws {
        try await withNotesComposition { rig, http in
            let calls = try #require(rig.menu.calls)
            try savedCall(a, in: rig.root); try savedCall(b, in: rig.root)
            await rig.menu.perform(.showCalls)
            await rows(calls, count: 2)
            try #require(calls.state.rows.allSatisfy { $0.canMakeSummary })
            await calls.send(.makeSummary(b)); await http.started.next()
            await calls.send(.read(a))
            await calls.send(detail: .makeSummary); await http.started.next()
            await detail(calls) { $0?.content == .preparing }
            await calls.send(detail: .cancelSummary)
            await detail(calls) { if case .some(.none) = $0?.content { true } else { false } }
            #expect(!FileManager.default.fileExists(atPath: job(a, in: rig.root).path))
            #expect(!FileManager.default.fileExists(atPath: rig.folder(a).appendingPathComponent("summary.md").path))
            #expect(try await phase(b, in: rig.root) == "running")
            await calls.send(detail: .makeSummary); await http.started.next()
            await rig.finish()
            #expect(try await phase(a, in: rig.root) == "interrupted")
            #expect(try await phase(b, in: rig.root) == "interrupted")
        }
    }

    @Test(arguments: [false, true])
    func cancellingQueuedPublicationKeepsOnlyEarlierNotes(previousNotes: Bool) async throws {
        try await withComposeFolder { root in
            try savedCall(a, in: root)
            if previousNotes { try Data("earlier complete notes".utf8).write(to: root.appendingPathComponent(a + "/summary.md")) }
            let storage = SummaryStorage(folder: root, timeZone: .gmt, trash: removeForTrash)
            let locations = HeldNotesLocation(storage: storage)
            let files = Files(locations: locations, disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let preferences = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json"))
            try preferences.updateNotes(.init(enabled: true, speakers: false, primary: notesRuntime))
            let http = NotesHTTP()
            let sut = AudelinSummaries(files: files, runtime: controlledRuntime(http), preferences: preferences,
                sink: TestLogSink(), callText: { try await storage.text(id: $0) }, date: { _ in "made" })
            do {
                await sut.submit(call: a, input: "saved words", entries: [.init(label: "Me", time: "3.0", text: "saved words")], finalWrite: true, usable: true)
                await http.started.next()
                await locations.hold(); try await http.succeed()
                await locations.entered.next()
                let cancelling = Task { await sut.cancel(call: a) }
                for await state in Observations({ sut.notesState(call: a) }) where state == .pending { break }
                await locations.release(); await cancelling.value
                #expect(sut.notesState(call: a) == .pending)
                #expect(sut.badges[a] == nil)
                #expect(try await files.load(call: a) == nil)
                #expect(try await files.notes(call: a)?.text == (previousNotes ? "earlier complete notes" : nil))
                #expect(try String(contentsOf: root.appendingPathComponent(a + "/transcript.md"), encoding: .utf8).contains("saved words"))
                await sut.shutdown()
            } catch { await locations.release(); await sut.shutdown(); throw error }
        }
    }

    @Test func failureShowsItsReasonAndRetryMakesAgain() async throws {
        try await withNotesComposition { rig, http in
            let calls = try #require(rig.menu.calls)
            try savedCall(a, in: rig.root)
            await rig.menu.perform(.showCalls); await rows(calls, count: 1)
            try #require(calls.state.rows[0].canMakeSummary)
            await calls.send(.read(a)); await calls.send(detail: .makeSummary)
            await http.started.next(); await http.fail()
            await detail(calls) { $0?.content == .failed(reason: "Не удалось составить или сохранить итоги. Расшифровка и аудио сохранены.", canRetry: true) }
            #expect(!calls.state.rows[0].canMakeSummary)
            await calls.send(detail: .retrySummary); await http.started.next()
            await detail(calls) { $0?.content == .preparing }
            try await http.succeed()
            await detail(calls) { if case .notes = $0?.content { true } else { false } }
            #expect(await http.bodies.count == 2)
        }
    }

    @Test func transcriptReadFailureCanBeRetriedBeforeAJobExists() async throws {
        try await withNotesComposition { rig, http in
            let calls = try #require(rig.menu.calls)
            try savedCall(a, in: rig.root)
            let transcript = rig.folder(a).appendingPathComponent("transcript.md")
            try FileManager.default.removeItem(at: transcript)
            try FileManager.default.createDirectory(at: transcript, withIntermediateDirectories: false)
            await rig.menu.perform(.showCalls); await rows(calls, count: 1)
            await calls.send(.read(a)); await calls.send(detail: .makeSummary)
            await detail(calls) { if case .failed(_, canRetry: true) = $0?.content { true } else { false } }
            #expect(!FileManager.default.fileExists(atPath: job(a, in: rig.root).path))
            #expect(await http.bodies.isEmpty)
            try FileManager.default.removeItem(at: transcript)
            try Data("**Me** 00:00:03\n\nsaved words\n".utf8).write(to: transcript)

            await calls.send(detail: .retrySummary)

            try #require(calls.state.failure == nil)
            await http.started.next()
            await detail(calls) { $0?.content == .preparing }
            try await http.succeed()
            await detail(calls) { if case .notes = $0?.content { true } else { false } }
            #expect(await http.bodies.count == 1)
        }
    }

    @Test(arguments: ["claim", "discard"])
    func storageFailureCanRecoverOnRetry(stage: String) async throws {
        try await withComposeFolder { root in
            try savedCall(a, in: root)
            let storage = SummaryStorage(folder: root, timeZone: .gmt, trash: removeForTrash)
            let disk = RecoveringNotesDisk()
            let files = Files(locations: storage, disk: disk, ownershipDirectory: root.appendingPathComponent("leases"))
            let preferences = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json"))
            try preferences.updateNotes(.init(enabled: false, speakers: false, primary: notesRuntime))
            let http = NotesHTTP()
            let sut = AudelinSummaries(files: files, runtime: controlledRuntime(http), preferences: preferences,
                sink: TestLogSink(), callText: { try await storage.text(id: $0) }, date: { _ in "made" })
            do {
                disk.failure.withLock { $0 = stage }
                sut.make(call: a)
                if stage == "discard" {
                    await http.started.next()
                    await sut.cancel(call: a)
                }
                for await state in Observations({ sut.notesState(call: a) }) {
                    if case .failure = state { break }
                }
                #expect(sut.badges[a] == .failed)
                try #require(sut.retryable.contains(a))
                if stage == "claim" { #expect(try await files.load(call: a) == nil) }
                else {
                    await #expect(throws: (any Error).self) { try await sut.retry(call: a) }
                    #expect(sut.badges[a] == .failed)
                    #expect(sut.retryable.contains(a))
                }
                disk.failure.withLock { $0 = nil }

                try await sut.retry(call: a)

                await http.started.next()
                try await http.succeed()
                for await state in Observations({ sut.notesState(call: a) }) {
                    if case .completed = state { break }
                }
                #expect(try await files.notes(call: a)?.text == generatedNotes)
                #expect(await http.bodies.count == (stage == "claim" ? 1 : 2))
                await sut.shutdown()
            } catch { await sut.shutdown(); throw error }
        }
    }

    @Test func unreadableJobRecordRetryReportsTheStorageFailure() async throws {
        try await withComposeFolder { root in
            try savedCall(a, in: root)
            let broken = Data("{broken".utf8)
            try broken.write(to: job(a, in: root))
            let storage = SummaryStorage(folder: root, timeZone: .gmt, trash: removeForTrash)
            let files = Files(locations: storage, disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let http = NotesHTTP()
            let sut = AudelinSummaries(files: files, runtime: controlledRuntime(http),
                preferences: PreferencesStore(fileURL: root.appendingPathComponent("preferences.json")),
                sink: TestLogSink(), callText: { try await storage.text(id: $0) }, date: { _ in "made" })
            do {
                await sut.recover(calls: [a])
                for await state in Observations({ sut.notesState(call: a) }) {
                    if case .failure = state { break }
                }

                await #expect(throws: (any Error).self) { try await sut.retry(call: a) }

                #expect(try Data(contentsOf: job(a, in: root)) == broken)
                #expect(await http.bodies.isEmpty)
                await sut.shutdown()
            } catch { await sut.shutdown(); throw error }
        }
    }

    @Test(arguments: [false, true])
    func requestedAndAutomaticJobsCompleteTheCallNotesMachine(automatic: Bool) async throws {
        try await withComposeFolder { root in
            try savedCall(a, in: root)
            let storage = SummaryStorage(folder: root, timeZone: .gmt, trash: removeForTrash)
            let files = Files(locations: storage, disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let preferences = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json"))
            try preferences.updateNotes(.init(enabled: automatic, speakers: false, primary: notesRuntime))
            let http = NotesHTTP(), dates = Values<Date>()
            let runtime = controlledRuntime(http)
            let sut = AudelinSummaries(files: files, runtime: runtime, preferences: preferences, sink: TestLogSink(),
                callText: { try await storage.text(id: $0) }, date: { dates.append($0); return "when made" })
            do {
                if automatic {
                    await sut.submit(call: a, input: "input", entries: [.init(label: "Me", time: "3.0", text: "saved words")], finalWrite: true, usable: true)
                } else { sut.make(call: a) }
                await http.started.next()
                #expect(sut.notesState(call: a) == .loading)
                try await http.succeed()
                for await state in Observations({ sut.notesState(call: a) }) {
                    if case .completed = state { break }
                }
                #expect(sut.notesState(call: a) == .completed(.init(text: generatedNotes, date: "when made")))
                let notes = try #require(try await files.notes(call: a))
                #expect(dates.all == [notes.made])
                await sut.shutdown()
            } catch { await sut.shutdown(); throw error }
        }
    }

    @Test func skippingAutomaticSubmissionKeepsAnIndependentRequest() async throws {
        try await withComposeFolder { root in
            try savedCall(a, in: root)
            let storage = SummaryStorage(folder: root, timeZone: .gmt, trash: removeForTrash)
            let files = Files(locations: storage, disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let preferences = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json"))
            try preferences.updateNotes(.init(enabled: true, speakers: false, primary: notesRuntime))
            let http = NotesHTTP()
            let sut = AudelinSummaries(files: files, runtime: controlledRuntime(http), preferences: preferences,
                sink: TestLogSink(), callText: { try await storage.text(id: $0) }, date: { _ in "made" })
            do {
                sut.waiting(call: a)
                sut.make(call: a); await http.started.next()
                try preferences.updateNotes(.init(enabled: false, speakers: false, primary: notesRuntime))
                await sut.submit(call: a, input: "automatic", entries: [], finalWrite: true, usable: true)
                #expect(sut.notesState(call: a) == .loading)
                #expect(sut.badges[a] == .pending)
                try await http.succeed()
                for await state in Observations({ sut.notesState(call: a) }) {
                    if case .completed = state { break }
                }
                #expect(try await files.notes(call: a)?.text == generatedNotes)
                #expect(await http.bodies.count == 1)
                await sut.shutdown()
            } catch { await sut.shutdown(); throw error }
        }
    }

    @Test func cancellingBeforeDispatchDiscardsThePendingRecord() async throws {
        try await withComposeFolder { root in
            try savedCall(a, in: root)
            let storage = SummaryStorage(folder: root, timeZone: .gmt, trash: removeForTrash)
            let files = Files(locations: storage, disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let runtime = Runtime(process: NotesProcess(), http: NotesHTTP(), credential: { _ in nil }, resolveProgram: { $0 }, deadline: { throw Failure.timeout })
            let sut = AudelinSummaries(files: files, runtime: runtime, preferences: PreferencesStore(fileURL: root.appendingPathComponent("preferences.json")), sink: TestLogSink(), callText: { try await storage.text(id: $0) }, date: { _ in "made" })
            sut.stopDispatch()
            sut.make(call: a)
            for await status in sut.updates() where status[a] == "Итоги ожидают запуска" { break }
            #expect(sut.notesState(call: a) == .loading)
            await sut.cancel(call: a)
            #expect(sut.notesState(call: a) == .pending)
            #expect(try await files.load(call: a) == nil)
            await sut.shutdown()
        }
    }

    @Test func callEndShowsMakingThenTheNotes() async throws {
        try await withNotesComposition(automatic: true) { rig, http in
            let calls = try #require(rig.menu.calls)
            try await rig.start(); await rig.mine.heard.next(); await rig.theirs.heard.next()
            try await rig.stop(); await http.started.next()
            await rig.menu.perform(.showCalls); await rows(calls, count: 1)
            await calls.send(.read("1970.01.01-0000"))
            await detail(calls) { $0?.content == .preparing }
            try await http.succeed()
            await detail(calls) { if case .notes = $0?.content { true } else { false } }
        }
    }
}

private let a = "2024.01.01-1000", b = "2024.01.01-0900"
private func savedCall(_ id: String, in root: URL) throws {
    let folder = root.appendingPathComponent(id)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false)
    try Data("# Transcript\n\n**Me** 00:00:03\n\nsaved words\n".utf8).write(to: folder.appendingPathComponent("transcript.md"))
}
private func job(_ id: String, in root: URL) -> URL { root.appendingPathComponent(id).appendingPathComponent(".summary-job.json") }
private func phase(_ id: String, in root: URL) async throws -> String? {
    let files = Files(locations: SummaryStorage(folder: root, timeZone: .gmt, trash: removeForTrash), disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("summary-ownership"))
    return try await files.load(call: id)?.phase
}
@MainActor private func rows(_ calls: AudelinCalls, count: Int) async {
    for await state in Observations({ calls.state }) where state.rows.count == count { return }
}
@MainActor private func detail(_ calls: AudelinCalls, _ matches: (CallsDetail?) -> Bool) async {
    for await value in Observations({ calls.detail }) where matches(value) { return }
}
@MainActor func withNotesComposition(automatic: Bool = false, _ body: (ComposeFixture, NotesHTTP) async throws -> Void) async throws {
    try await withComposeFolder { root in
        let http = NotesHTTP()
        let runtime = controlledRuntime(http)
        let rig = try await ComposeFixture.make(root: root,
            preferences: Preferences(notes: .init(enabled: automatic, speakers: false, primary: notesRuntime), automaticRecording: false, callsFolder: root), summaryRuntime: runtime)
        do { try await body(rig, http); await rig.finish() }
        catch { await rig.finish(); throw error }
    }
}
private struct NotesProcess: ProcessRunning {
    func run(program: String, arguments: [String], input: Data) throws -> ProcessOutput { Issue.record("unexpected process"); throw Failure.unavailable }
}
actor NotesHTTP: HTTPRequesting {
    nonisolated let started = Signal()
    var bodies: [String] = []
    private var pending: [UUID: AsyncStream<HTTPResponse>.Continuation] = [:]
    func request(url: URL, headers: [String: String], body: Data, loopback: Bool) async throws -> HTTPResponse {
        let id = UUID(), pair = AsyncStream<HTTPResponse>.makeStream()
        pending[id] = pair.continuation
        bodies.append(String(decoding: body, as: UTF8.self)); started.send()
        defer { pending[id] = nil }
        for await response in pair.stream { return response }
        throw Failure.cancelled
    }
    func succeed() throws {
        let response = HTTPResponse(status: 200, body: try JSONSerialization.data(withJSONObject: ["choices": [["finish_reason": "stop", "message": ["content": generatedNotes]]]]))
        pending.values.forEach { $0.yield(response); $0.finish() }
    }
    func fail() { pending.values.forEach { $0.yield(.init(status: 500, body: Data())); $0.finish() } }
}

let generatedNotes = "## What this was about\n\nSaved topic.\n\n## Key points\n\n- Saved words.\n\n## Decisions\n\nNone recorded.\n\n## Actions\n\nNone recorded.\n"

private let notesRuntime = NotesPreferences.Runtime(kind: "compatibleAPI", model: "configured-model", executable: "", endpoint: "http://127.0.0.1/v1", credentialVariable: "")
private func controlledRuntime(_ http: NotesHTTP) -> Runtime {
    Runtime(process: NotesProcess(), http: http, credential: { _ in nil }, resolveProgram: { $0 }, deadline: {
        let never = AsyncStream<Void> { _ in }
        for await _ in never {}
        try Task.checkCancellation()
    })
}

private final class RecoveringNotesDisk: Disk, Sendable {
    let failure = Mutex<String?>(nil)
    private let base = FileDisk()
    func read(_ url: URL) throws -> Data { try base.read(url) }
    func exists(_ url: URL) throws -> Bool { try base.exists(url) }
    func readStamped(_ url: URL) throws -> (data: Data, modified: Date) { try base.readStamped(url) }
    func replace(_ data: Data, at url: URL) throws { try base.replace(data, at: url) }
    func create(_ data: Data, at url: URL) throws -> Bool {
        if failure.withLock({ $0 == "claim" }) { throw CocoaError(.fileWriteOutOfSpace) }
        return try base.create(data, at: url)
    }
    func remove(_ url: URL) throws {
        if failure.withLock({ $0 == "discard" }) { throw CocoaError(.fileWriteNoPermission) }
        try base.remove(url)
    }
}

private actor HeldNotesLocation: Locations {
    let storage: SummaryStorage
    nonisolated let entered = Signal()
    private var held = false
    private var waiter: CheckedContinuation<Void, Never>?
    init(storage: SummaryStorage) { self.storage = storage }
    func hold() { held = true }
    func release() { held = false; waiter?.resume(); waiter = nil }
    func withFolder<Value: Sendable>(call: String, _ work: @Sendable (URL) throws -> Value) async throws -> Value {
        if held { await withCheckedContinuation { waiter = $0; entered.send() } }
        return try await storage.withFolder(call: call, work)
    }
}
