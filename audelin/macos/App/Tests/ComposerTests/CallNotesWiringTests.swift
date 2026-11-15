import CallDetail
import BlockingTestWork
import CallsListUI
import CallsStorage
import Foundation
import Observation
import Preferences
import SummaryFiles
import SummaryRuntime
import Synchronization
import Testing
import TemplateFiles
@testable import Composer

private typealias Files = SummaryFiles.Files
private typealias Disk = SummaryFiles.Disk
private typealias FileDisk = SummaryFiles.FileDisk

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
            let storage = callsStorage(folder: root, timeZone: .gmt, trash: removeForTrash)
            let locations = HeldNotesLocation(storage: storage)
            let files = Files(locations: locations, disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let http = NotesHTTP()
            let sut = makeSummaries(files: files, storage: storage, http: http, enabled: true)
            do {
                sut.send(.finalized(a, entries: [.init(label: "Me", time: "3.0", text: "saved words")], finalWrite: true, usable: true, notesOn: true))
                await http.started.next()
                await locations.hold(); try await http.succeed()
                await locations.entered.next()
                let cancelling = Task { await sut.cancel(call: a) }
                try await waitUntil("the cancel is taken") { sut.state.calls[a]?.cancelling == true }
                await locations.release(); await cancelling.value
                #expect(sut.state.calls[a] == nil && sut.badges[a] == nil)
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
            let storage = callsStorage(folder: root, timeZone: .gmt, trash: removeForTrash)
            let disk = RecoveringNotesDisk()
            let files = Files(locations: storage, disk: disk, ownershipDirectory: root.appendingPathComponent("leases"))
            let http = NotesHTTP()
            let sut = makeSummaries(files: files, storage: storage, http: http, enabled: false)
            do {
                disk.failure.withLock { $0 = stage }
                sut.make(call: a)
                if stage == "discard" {
                    await http.started.next()
                    await sut.cancel(call: a)
                }
                try await waitUntil("the call fails") { sut.state.calls[a]?.stage == .failed }
                #expect(sut.badges[a] == .failed)
                try #require(sut.retryable.contains(a))
                if stage == "claim" { #expect(try await files.load(call: a) == nil) }
                disk.failure.withLock { $0 = nil }

                try await sut.retry(call: a)

                await http.started.next()
                try await http.succeed()
                try await waitUntil("notes are made") { sut.state.calls[a]?.stage == .succeeded }
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
            let storage = callsStorage(folder: root, timeZone: .gmt, trash: removeForTrash)
            let files = Files(locations: storage, disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let http = NotesHTTP()
            let sut = makeSummaries(files: files, storage: storage, http: http, enabled: false)
            do {
                sut.recover(calls: [a])
                try await waitUntil("the call fails") { sut.state.calls[a]?.stage == .failed }

                await #expect(throws: (any Error).self) { try await sut.retry(call: a) }

                #expect(try Data(contentsOf: job(a, in: root)) == broken)
                #expect(await http.bodies.isEmpty)
                await sut.shutdown()
            } catch { await sut.shutdown(); throw error }
        }
    }

    @Test(arguments: [false, true])
    func requestedAndAutomaticJobsPublishTheNotes(automatic: Bool) async throws {
        try await withComposeFolder { root in
            try savedCall(a, in: root)
            let storage = callsStorage(folder: root, timeZone: .gmt, trash: removeForTrash)
            let files = Files(locations: storage, disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let http = NotesHTTP()
            let sut = makeSummaries(files: files, storage: storage, http: http, enabled: automatic)
            do {
                if automatic {
                    sut.send(.finalized(a, entries: [.init(label: "Me", time: "3.0", text: "saved words")], finalWrite: true, usable: true, notesOn: true))
                } else { sut.make(call: a) }
                await http.started.next()
                #expect(sut.badges[a] == .pending)
                try await http.succeed()
                try await waitUntil("notes are made") { sut.state.calls[a]?.stage == .succeeded }
                #expect(try await files.notes(call: a)?.text == generatedNotes)
                await sut.shutdown()
            } catch { await sut.shutdown(); throw error }
        }
    }

    @Test func skippingAutomaticSubmissionKeepsAnIndependentRequest() async throws {
        try await withComposeFolder { root in
            try savedCall(a, in: root)
            let storage = callsStorage(folder: root, timeZone: .gmt, trash: removeForTrash)
            let files = Files(locations: storage, disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let http = NotesHTTP()
            let sut = makeSummaries(files: files, storage: storage, http: http, enabled: true)
            let callbacks = sut.callbacks(timeZone: .gmt, notesOn: { true })
            do {
                await callbacks.waiting(root.appendingPathComponent(a))
                sut.make(call: a); await http.started.next()
                sut.forget(call: a)
                #expect(sut.badges[a] == .pending)
                try await http.succeed()
                try await waitUntil("notes are made") { sut.state.calls[a]?.stage == .succeeded }
                #expect(try await files.notes(call: a)?.text == generatedNotes)
                #expect(await http.bodies.count == 1)
                await sut.shutdown()
            } catch { await sut.shutdown(); throw error }
        }
    }

    @Test func cancellingBeforeDispatchDiscardsThePendingRecord() async throws {
        try await withComposeFolder { root in
            try savedCall(a, in: root)
            let storage = callsStorage(folder: root, timeZone: .gmt, trash: removeForTrash)
            let files = Files(locations: storage, disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let sut = makeSummaries(files: files, storage: storage, http: NotesHTTP(), enabled: false)
            sut.stopDispatch()
            sut.make(call: a)
            for await status in sut.updates() where status[a] == "Итоги ожидают запуска" { break }
            await sut.cancel(call: a)
            #expect(sut.state.calls[a] == nil)
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
@MainActor private func makeSummaries(files: Files, storage: CallsStorage, http: NotesHTTP, enabled: Bool) -> SummariesModel {
    SummariesModel(keeping: { true }, templates: TestDefaultTemplates(), text: { CallsListText(language: .russian) },
                   preparation: SummariesPreparationPort(notes: { .init(enabled: enabled, speakers: false, primary: notesRuntime) },
                                                         makeID: { UUID().uuidString }, callText: { try await storage.text(id: $0) }),
                   files: SummariesFilesPort(files: files, makeID: { UUID().uuidString }),
                   generation: SummaryGeneration(runtime: controlledRuntime(http), sink: TestLogSink()))
}
private func job(_ id: String, in root: URL) -> URL { root.appendingPathComponent(id).appendingPathComponent(".summary-job.json") }
private func phase(_ id: String, in root: URL) async throws -> String? {
    let files = Files(locations: callsStorage(folder: root, timeZone: .gmt, trash: removeForTrash), disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("summary-ownership"))
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
    func restore(_ data: Data, at url: URL, modified: Date) throws { try base.restore(data, at: url, modified: modified) }
    func remove(_ url: URL) throws {
        if failure.withLock({ $0 == "discard" }) { throw CocoaError(.fileWriteNoPermission) }
        try base.remove(url)
    }
}

private actor HeldNotesLocation: Locations {
    let storage: CallsStorage
    nonisolated let entered = Signal()
    private var held = false
    private var waiter: CheckedContinuation<Void, Never>?
    init(storage: CallsStorage) { self.storage = storage }
    func hold() { held = true }
    func release() { held = false; waiter?.resume(); waiter = nil }
    func withFolder<Value: Sendable>(call: String, _ work: @Sendable (URL) throws -> Value) async throws -> Value {
        if held { await withCheckedContinuation { waiter = $0; entered.send() } }
        return try await storage.withFolder(call: call, work)
    }
}

extension CallNotesWiringTests {
    @Test(arguments: [true, false])
    func chosenTemplateMakesNotesAgainWithTheCapturedKeepChoice(keeping: Bool) async throws {
        try await withNotesComposition { rig, http in
            let calls = try #require(rig.menu.calls)
            try savedCall(a, in: rig.root); try savedCall(b, in: rig.root)
            let files = templateSummaryFiles(rig.root)
            try await seedPublishedPair(files)
            let old = try #require(try await files.versions(call: a))
            try writeDaily(in: rig.root)
            await rig.menu.perform(.showCalls); await rows(calls, count: 2)
            await calls.send(.read(a))
            try calls.setKeepPreviousNotes(keeping)
            #expect(calls.keepPreviousNotes == keeping)
            await calls.send(detail: .makeSummaryWithTemplate("Daily"))
            await http.started.next()
            #expect(await http.bodies.last?.contains("Daily instructions from the file") == true)
            try calls.setKeepPreviousNotes(!keeping)
            await calls.send(detail: .makeSummaryWithTemplate("Default"))
            // Selection changes do not own or stop a running job.
            await calls.send(.read(b))
            #expect(calls.detail?.id == b)
            try await http.succeed()
            for await statuses in rig.menu.summaryStates() where statuses[a] == "Итоги готовы" { break }
            let pair = try #require(try await files.versions(call: a))
            #expect(pair.current.text == generatedNotes && pair.current.template == Attribution(id: "Daily", name: "Daily"))
            #expect(pair.previous == (keeping ? old.current : nil))
            #expect(await http.bodies.count == 1)
            #expect(calls.keepPreviousNotes == !keeping)
        }
    }

    @Test(arguments: ["Default", "Daily"])
    func aCompletedRunAcceptsAnotherChosenTemplateRun(secondTemplate: String) async throws {
        try await withNotesComposition { rig, http in
            let calls = try #require(rig.menu.calls)
            try savedCall(a, in: rig.root); try writeDaily(in: rig.root)
            await rig.menu.perform(.showCalls); await rows(calls, count: 1)
            await calls.send(.read(a))
            for template in ["Default", secondTemplate] {
                await calls.send(detail: .makeSummaryWithTemplate(template)); await http.started.next()
                try await http.succeed()
                for await statuses in rig.menu.summaryStates() where statuses[a] == "Итоги готовы" { break }
            }
            let pair = try #require(try await templateSummaryFiles(rig.root).versions(call: a))
            #expect(pair.previous?.template == .default && pair.current.template.name == secondTemplate)
            #expect(await http.bodies.count == 2)
        }
    }

    @Test func recoveryUsesSavedDailyInstructionsAfterItsFileChanges() async throws {
        try await withComposeFolder { root in
            try savedCall(a, in: root); try writeDaily(in: root)
            let files = templateSummaryFiles(root)
            try await seedPublishedPair(files)
            let storage = callsStorage(folder: root, timeZone: .gmt, trash: removeForTrash)
            let preparation = SummariesPreparationPort(notes: { .init(primary: notesRuntime) }, makeID: { "pending-daily" },
                                                       callText: { try await storage.text(id: $0) })
            var job = await preparation.job(for: try await preparation.submission(call: a)).job
            var template = TemplateFiles.Files.builtInDefault
            template.name = "Daily"; template.instructions = "Saved Daily instructions"
            job.template = notesTemplate(template).jobTemplate; job.keepPrevious = false; job.requested = true
            _ = try await SummariesFilesPort(files: files, makeID: { "unused" }).claim(job)
            template.instructions = "Changed Daily instructions"
            try TemplateFiles.Files.encode(template).write(to: root.appendingPathComponent("Templates/Daily.md"), atomically: true, encoding: .utf8)
            let http = NotesHTTP()
            let rig = try await ComposeFixture.make(root: root,
                preferences: Preferences(notes: .init(primary: notesRuntime), automaticRecording: false, callsFolder: root),
                summaryRuntime: controlledRuntime(http))
            do {
                await http.started.next()
                #expect(await http.bodies.last?.contains("Saved Daily instructions") == true)
                #expect(await http.bodies.last?.contains("Changed Daily instructions") == false)
                try await http.succeed()
                for await statuses in rig.menu.summaryStates() where statuses[a] == "Итоги готовы" { break }
                let pair = try #require(try await files.versions(call: a))
                #expect(pair.current.template.name == "Daily" && pair.previous == nil)
                await rig.finish()
            } catch { await rig.finish(); throw error }
        }
    }

    @Test(arguments: ["cancel", "failure", "missing"])
    func unsuccessfulMakeAgainKeepsThePublishedPair(outcome: String) async throws {
        try await withNotesComposition { rig, http in
            let calls = try #require(rig.menu.calls)
            try savedCall(a, in: rig.root); try writeDaily(in: rig.root)
            let files = templateSummaryFiles(rig.root)
            try await seedPublishedPair(files)
            let old = try #require(try await files.versions(call: a))
            await rig.menu.perform(.showCalls); await rows(calls, count: 1)
            await calls.send(.read(a))
            await calls.send(detail: .makeSummaryWithTemplate(outcome == "missing" ? "Missing" : "Daily"))
            if outcome == "missing" {
                for await statuses in rig.menu.summaryStates() where statuses[a]?.contains("Не удалось") == true { break }
                #expect(await http.bodies.isEmpty)
            } else {
                await http.started.next()
                if outcome == "cancel" { await calls.send(detail: .cancelSummary) }
                else {
                    await http.fail()
                    for await statuses in rig.menu.summaryStates() where statuses[a]?.contains("Не удалось") == true { break }
                }
                #expect(await http.bodies.count == 1)
            }
            #expect(try await files.versions(call: a) == old)
            await calls.send(.read(a))
            await detail(calls) { if case let .notes(text, _) = $0?.content { text == old.current.text } else { false } }
        }
    }
}

private func writeDaily(in root: URL) throws {
    let folder = root.appendingPathComponent("Templates")
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    var template = TemplateFiles.Files.builtInDefault
    template.name = "Daily"; template.instructions = "Daily instructions from the file"
    try TemplateFiles.Files.encode(template).write(to: folder.appendingPathComponent("Daily.md"), atomically: true, encoding: .utf8)
}
private func templateSummaryFiles(_ root: URL) -> Files {
    Files(locations: callsStorage(folder: root, timeZone: .gmt, trash: removeForTrash), disk: FileDisk(),
          ownershipDirectory: root.appendingPathComponent("seed-leases"))
}
private func seedPublishedPair(_ files: Files) async throws {
    var old: SummaryFiles.Record?
    for name in ["Previous", "Current"] {
        let record = SummaryFiles.Record(job: name, call: a, input: "seed-input", snapshot: Data("{}".utf8), phase: "pending")
        if let old { _ = try await files.replaceAttempt(old, with: record) }
        else { _ = try await files.claim(record) }
        #expect(try await files.start(record))
        try await files.publish(record, notes: name, template: .default, keeping: .rotation)
        var completed = record; completed.phase = "succeeded"
        try await files.progress(completed)
        await files.release(job: record.job, call: record.call, input: record.input)
        old = completed
    }
}
