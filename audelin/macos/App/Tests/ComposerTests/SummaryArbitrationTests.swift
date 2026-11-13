import CallsListUI
import BlockingTestWork
import Foundation
import Preferences
import SummaryFiles
import SummaryJobs
import SummaryRuntime
import Testing
@testable import Composer

@MainActor @Suite(.timeLimit(.minutes(1))) struct SummaryArbitrationTests {
    @Test func completionDuringStartupReadCannotLoseOrDoubleDispatchPendingJob() async throws {
        try await withComposeFolder { root in
            let id = "1970.01.01-0000"
            try FileManager.default.createDirectory(at: root.appendingPathComponent(id), withIntermediateDirectories: true)
            let preferences = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json"))
            try preferences.updateNotes(.init(enabled: true))
            let files = Files(locations: SummaryStorage(folder: root, timeZone: .gmt, trash: removeForTrash), disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let readStarted = Signal(), releaseRead = Signal(), submitStarted = Signal()
            let runtime = Runtime(process: ArbitrationProcess(), http: ArbitrationHTTP(), credential: { _ in nil }, resolveProgram: { $0 }, deadline: { throw Failure.timeout })
            let summaries = AudelinSummaries(files: files, runtime: runtime, preferences: preferences, sink: TestLogSink(), callText: { _ in .init(notes: nil, transcript: []) }, date: { _ in "made" }, load: { call in
                readStarted.send(); await releaseRead.next(); return try await files.load(call: call)
            })
            summaries.stopDispatch()
            let recovery = Task { await summaries.recover(calls: [id]) }
            await readStarted.next()
            let submit = Task {
                submitStarted.send()
                await summaries.submit(call: id, input: "input", entries: [.init(label: "A", time: "0", text: "spoken")], finalWrite: true, usable: true)
            }
            await submitStarted.next(); releaseRead.send()
            await recovery.value; await submit.value
            let record = try #require(try await files.load(call: id))
            #expect(record.phase == "pending")
            await summaries.submit(call: id, input: "other-input", entries: [], finalWrite: false, usable: false)
            #expect(try await files.load(call: id)?.job == record.job)
            #expect(summaries.statuses[id] == "Итоги ожидают запуска")
            await summaries.shutdown()
        }
    }
    @Test(arguments: [false, true])
    func secondCompositionObservesHeldGenerationWithoutInvalidatingPublication(recoverObserver: Bool) async throws {
        try await withComposeFolder { root in
            let id = "1970.01.01-0000"
            try FileManager.default.createDirectory(at: root.appendingPathComponent(id), withIntermediateDirectories: true)
            let preferences = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json"))
            try preferences.updateNotes(enabledNotes())
            let directory = root.appendingPathComponent("leases")
            let ownerFiles = Files(locations: SummaryStorage(folder: root, timeZone: .gmt, trash: removeForTrash), disk: FileDisk(), ownershipDirectory: directory)
            let observerFiles = Files(locations: SummaryStorage(folder: root, timeZone: .gmt, trash: removeForTrash), disk: FileDisk(), ownershipDirectory: directory)
            let http = HeldSummaryHTTP()
            let runtime = Runtime(process: ArbitrationProcess(), http: http, credential: { _ in nil }, resolveProgram: { $0 }, deadline: { try await waitForCancellation() })
            let owner = AudelinSummaries(files: ownerFiles, runtime: runtime, preferences: preferences, sink: TestLogSink(), callText: { _ in .init(notes: nil, transcript: []) }, date: { _ in "made" })
            let observer = AudelinSummaries(files: observerFiles, runtime: runtime, preferences: preferences, sink: TestLogSink(), callText: { _ in .init(notes: nil, transcript: []) }, date: { _ in "made" })
            await owner.submit(call: id, input: "input", entries: [.init(label: "A", time: "0", text: "spoken")], finalWrite: true, usable: true)
            await http.started.next()
            do {
                if recoverObserver { await observer.recover(calls: [id]) }
                else {
                    await observer.submit(call: id, input: "competing", entries: [.init(label: "B", time: "0", text: "competing")], finalWrite: true, usable: true)
                }
                #expect(observer.statuses[id] == "Готовим итоги…")
                #expect(owner.busy && observer.busy)
                await observer.refreshObserved()
                #expect(observer.busy)
                await #expect(throws: (any Error).self) { try await observer.retry(call: id) }
                #expect(try await observerFiles.load(call: id)?.phase == "running")
                await observer.submit(call: id, input: "duplicate", entries: [], finalWrite: false, usable: false)
                http.release.send()
                for await status in owner.updates() where status[id] == "Итоги готовы" { break }
                #expect(try await observerFiles.load(call: id)?.phase == "succeeded")
                await observer.refreshObserved()
                #expect(!owner.busy && !observer.busy)
                #expect(observer.statuses[id] == "Итоги готовы")
                #expect(await http.requests == 1)
                await owner.shutdown(); await observer.shutdown()
            } catch {
                http.release.send(); await owner.shutdown(); await observer.shutdown(); throw error
            }
        }
    }

    @Test(arguments: [false, true], [false, true])
    func interruptedObserverFollowsAnotherInstancesRetry(refuseRetryFirst: Bool, recoverObserver: Bool) async throws {
        try await withComposeFolder { root in
            let id = "1970.01.01-0000"
            try FileManager.default.createDirectory(at: root.appendingPathComponent(id), withIntermediateDirectories: true)
            let preferences = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json"))
            try preferences.updateNotes(enabledNotes())
            let directory = root.appendingPathComponent("leases")
            let ownerFiles = Files(locations: SummaryStorage(folder: root, timeZone: .gmt, trash: removeForTrash), disk: FileDisk(), ownershipDirectory: directory)
            let observerFiles = Files(locations: SummaryStorage(folder: root, timeZone: .gmt, trash: removeForTrash), disk: FileDisk(), ownershipDirectory: directory)
            _ = try await ownerFiles.claim(SummaryJobStore(files: ownerFiles).record(savedJob(call: id), phase: "interrupted"))
            let http = HeldSummaryHTTP()
            let runtime = Runtime(process: ArbitrationProcess(), http: http, credential: { _ in nil }, resolveProgram: { $0 }, deadline: { try await waitForCancellation() })
            let owner = AudelinSummaries(files: ownerFiles, runtime: runtime, preferences: preferences, sink: TestLogSink(), callText: { _ in .init(notes: nil, transcript: []) }, date: { _ in "made" })
            let observer = AudelinSummaries(files: observerFiles, runtime: runtime, preferences: preferences, sink: TestLogSink(), callText: { _ in .init(notes: nil, transcript: []) }, date: { _ in "made" })
            await owner.recover(calls: [id])
            if recoverObserver { await observer.recover(calls: [id]) }
            else {
                await observer.submit(call: id, input: "competing", entries: [.init(label: "B", time: "0", text: "competing")], finalWrite: true, usable: true)
            }
            #expect(!owner.busy && !observer.busy)
            #expect(observer.retryable == [id])
            do {
                try await owner.retry(call: id)
                await http.started.next()
                if refuseRetryFirst {
                    await #expect(throws: (any Error).self) { try await observer.retry(call: id) }
                    #expect(observer.busy && observer.retryable.isEmpty)
                }
                await observer.refreshObserved()
                #expect(observer.busy && observer.retryable.isEmpty)
                #expect(observer.statuses[id] == CallsListText(language: .russian).summaryStatus(.running, false))
                http.release.send()
                for await status in owner.updates() where status[id] == "Итоги готовы" { break }
                await observer.refreshObserved()
                #expect(!observer.busy && observer.statuses[id] == "Итоги готовы")
                #expect(await http.requests == 1)
                await owner.shutdown(); await observer.shutdown()
            } catch { http.release.send(); await owner.shutdown(); await observer.shutdown(); throw error }
        }
    }

    @Test(arguments: [false, true])
    func refreshCannotReplaceALocallyRetriedJob(failedRead: Bool) async throws {
        try await withComposeFolder { root in
            let id = "1970.01.01-0000"
            try FileManager.default.createDirectory(at: root.appendingPathComponent(id), withIntermediateDirectories: true)
            let preferences = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json"))
            try preferences.updateNotes(enabledNotes())
            let files = Files(locations: SummaryStorage(folder: root, timeZone: .gmt, trash: removeForTrash), disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            _ = try await files.claim(SummaryJobStore(files: files).record(savedJob(call: id), phase: "interrupted"))
            let reads = HeldObserverRead(files: files, fails: failedRead)
            let http = HeldSummaryHTTP()
            let runtime = Runtime(process: ArbitrationProcess(), http: http, credential: { _ in nil }, resolveProgram: { $0 }, deadline: { try await waitForCancellation() })
            let summaries = AudelinSummaries(files: files, runtime: runtime, preferences: preferences, sink: TestLogSink(), callText: { _ in .init(notes: nil, transcript: []) }, date: { _ in "made" }, load: { try await reads.load(call: $0) })
            await summaries.recover(calls: [id])
            let refresh = Task { await summaries.refreshObserved() }
            await reads.started.next()
            do {
                try await summaries.retry(call: id)
                await http.started.next()
                reads.release.send(); await refresh.value
                await summaries.refreshObserved()
                #expect(await reads.count == 3)
                #expect(summaries.busy && summaries.retryable.isEmpty)
                #expect(summaries.statuses[id] == CallsListText(language: .russian).summaryStatus(.noting, false))
                http.release.send()
                for await status in summaries.updates() where status[id] == "Итоги готовы" { break }
                #expect(!summaries.busy)
                #expect(try await files.load(call: id)?.phase == "succeeded")
                await summaries.shutdown()
            } catch {
                reads.release.send(); await refresh.value
                http.release.send(); await summaries.shutdown(); throw error
            }
        }
    }

    @Test(arguments: ["running", "observed"], ["read-error", "absent", "snapshot", "phase"])
    func unresolvedObserverRefreshBlocksUntilConfirmedCompletion(initial: String, failure: String) async throws {
        try await withComposeFolder { root in
            let id = "1970.01.01-0000"
            try FileManager.default.createDirectory(at: root.appendingPathComponent(id), withIntermediateDirectories: true)
            let preferences = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json"))
            let directory = root.appendingPathComponent("leases")
            let owner = Files(locations: SummaryStorage(folder: root, timeZone: .gmt, trash: removeForTrash), disk: FileDisk(), ownershipDirectory: directory)
            let files = Files(locations: SummaryStorage(folder: root, timeZone: .gmt, trash: removeForTrash), disk: FileDisk(), ownershipDirectory: directory)
            let pending = try SummaryJobStore(files: files).record(savedJob(call: id), phase: "pending")
            _ = try await owner.claim(pending)
            #expect(try await owner.start(pending))
            var running = pending; running.phase = "running"
            var terminal = pending; terminal.phase = "succeeded"
            var invalid = running
            if failure == "snapshot" { invalid.snapshot = Data("invalid snapshot".utf8) }
            else { invalid.phase = "unknown-phase" }
            let failedRead: Result<Record?, ObserverReadFailure> = failure == "read-error" ? .failure(.unavailable) : .success(failure == "absent" ? nil : invalid)
            let reads = ObserverReads([.success(initial == "running" ? running : pending), failedRead, .success(terminal)])
            let runtime = Runtime(process: ArbitrationProcess(), http: ArbitrationHTTP(), credential: { _ in nil }, resolveProgram: { $0 }, deadline: { throw Failure.timeout })
            let observer = AudelinSummaries(files: files, runtime: runtime, preferences: preferences, sink: TestLogSink(), callText: { _ in .init(notes: nil, transcript: []) }, date: { _ in "made" }, load: { _ in try await reads.next() })
            await observer.recover(calls: [id])
            if initial == "observed" {
                for await status in observer.updates() where status[id] == CallsListText(language: .russian).summaryStatus(.observed, false) { break }
            }
            #expect(observer.busy)
            await observer.refreshObserved()
            #expect(observer.busy)
            #expect(observer.retryable.isEmpty)
            #expect(try await owner.load(call: id)?.phase == "running")
            try await owner.publish(pending, notes: "complete notes")
            try await owner.progress(terminal)
            await observer.refreshObserved()
            #expect(!observer.busy && observer.statuses[id] == "Итоги готовы")
            await observer.shutdown()
            await owner.release(job: pending.job, call: id, input: pending.input)
        }
    }

    @Test func confirmedPendingObserverKeepsWatchingForDispatch() async throws {
        try await withComposeFolder { root in
            let id = "1970.01.01-0000"
            let preferences = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json"))
            let files = Files(locations: SummaryStorage(folder: root, timeZone: .gmt, trash: removeForTrash), disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let pending = try SummaryJobStore(files: files).record(savedJob(call: id), phase: "pending")
            var running = pending; running.phase = "running"
            var terminal = pending; terminal.phase = "failed"
            let reads = ObserverReads([.success(running), .success(pending), .success(running), .success(terminal)])
            let runtime = Runtime(process: ArbitrationProcess(), http: ArbitrationHTTP(), credential: { _ in nil }, resolveProgram: { $0 }, deadline: { throw Failure.timeout })
            let observer = AudelinSummaries(files: files, runtime: runtime, preferences: preferences, sink: TestLogSink(), callText: { _ in .init(notes: nil, transcript: []) }, date: { _ in "made" }, load: { _ in try await reads.next() })
            await observer.recover(calls: [id])
            #expect(observer.busy)
            await observer.refreshObserved()
            #expect(!observer.busy && observer.statuses[id] == CallsListText(language: .russian).summaryStatus(.pending, false))
            await observer.refreshObserved()
            #expect(observer.busy && observer.statuses[id] == CallsListText(language: .russian).summaryStatus(.running, false))
            await observer.refreshObserved()
            #expect(!observer.busy && observer.statuses[id] == CallsListText(language: .russian).summaryStatus(.failed, false))
            await observer.shutdown()
        }
    }

    @Test func shutdownRetainsOwnershipUntilCancelledRequestCleanupIsJoined() async throws {
        try await withComposeFolder { root in
            let id = "1970.01.01-0000"
            try FileManager.default.createDirectory(at: root.appendingPathComponent(id), withIntermediateDirectories: true)
            let preferences = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json"))
            try preferences.updateNotes(enabledNotes())
            let directory = root.appendingPathComponent("leases")
            let ownerFiles = Files(locations: SummaryStorage(folder: root, timeZone: .gmt, trash: removeForTrash), disk: FileDisk(), ownershipDirectory: directory)
            let observerFiles = Files(locations: SummaryStorage(folder: root, timeZone: .gmt, trash: removeForTrash), disk: FileDisk(), ownershipDirectory: directory)
            let http = JoinedCancellationHTTP()
            let runtime = Runtime(process: ArbitrationProcess(), http: http, credential: { _ in nil }, resolveProgram: { $0 }, deadline: { try await waitForCancellation() })
            let summaries = AudelinSummaries(files: ownerFiles, runtime: runtime, preferences: preferences, sink: TestLogSink(), callText: { _ in .init(notes: nil, transcript: []) }, date: { _ in "made" })
            await summaries.submit(call: id, input: "input", entries: [.init(label: "A", time: "0", text: "spoken")], finalWrite: true, usable: true)
            await http.started.next()
            let shutdown = Task { await summaries.shutdown() }
            await http.cancelled.next()
            do {
                #expect(try await observerFiles.load(call: id)?.phase == "running")
                http.cleanup.send(); await shutdown.value
                #expect(try await observerFiles.load(call: id)?.phase == "interrupted")
                #expect(await http.requests == 1)
            } catch { http.cleanup.send(); await shutdown.value; throw error }
        }
    }

    @Test func pendingRecoveryRetainsItsSnapshotOverConcurrentCompletion() async throws {
        try await withComposeFolder { root in
            let id = "1970.01.01-0000"
            try FileManager.default.createDirectory(at: root.appendingPathComponent(id), withIntermediateDirectories: true)
            let preferences = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json"))
            try preferences.updateNotes(enabledNotes())
            let files = Files(locations: SummaryStorage(folder: root, timeZone: .gmt, trash: removeForTrash), disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let store = SummaryJobStore(files: files)
            let saved = savedJob(call: id)
            #expect(try await store.claim(saved).owned)
            let readStarted = Signal(), releaseRead = Signal(), submitStarted = Signal()
            let http = HeldSummaryHTTP()
            let runtime = Runtime(process: ArbitrationProcess(), http: http, credential: { _ in nil }, resolveProgram: { $0 }, deadline: { try await waitForCancellation() })
            let summaries = AudelinSummaries(files: files, runtime: runtime, preferences: preferences, sink: TestLogSink(), callText: { _ in .init(notes: nil, transcript: []) }, date: { _ in "made" }, load: { call in
                readStarted.send(); await releaseRead.next(); return try await files.load(call: call)
            })
            let recovery = Task { await summaries.recover(calls: [id]) }
            await readStarted.next()
            let submit = Task {
                submitStarted.send()
                await summaries.submit(call: id, input: "new-input", entries: [], finalWrite: false, usable: false)
            }
            await submitStarted.next(); releaseRead.send()
            await recovery.value; await submit.value; await http.started.next()
            do {
                let running = try #require(try await files.load(call: id))
                #expect(try store.state(running).job == saved)
                http.release.send()
                for await status in summaries.updates() where status[id] == "Итоги готовы" { break }
                #expect(await http.requests == 1)
                #expect(try await files.load(call: id)?.job == saved.id)
                await summaries.shutdown()
            } catch { http.release.send(); await summaries.shutdown(); throw error }
        }
    }

    @Test func corruptRecoveryCannotBeReplacedByCompletion() async throws {
        try await withComposeFolder { root in
            let id = "1970.01.01-0000", folder = root.appendingPathComponent(id)
            let corrupt = Data("{broken".utf8)
            do {
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                try corrupt.write(to: folder.appendingPathComponent(".summary-job.json"))
            }
            let preferences = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json"))
            try preferences.updateNotes(enabledNotes())
            let files = Files(locations: SummaryStorage(folder: root, timeZone: .gmt, trash: removeForTrash), disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let runtime = Runtime(process: ArbitrationProcess(), http: ArbitrationHTTP(), credential: { _ in nil }, resolveProgram: { $0 }, deadline: { throw Failure.timeout })
            let summaries = AudelinSummaries(files: files, runtime: runtime, preferences: preferences, sink: TestLogSink(), callText: { _ in .init(notes: nil, transcript: []) }, date: { _ in "made" })
            await summaries.recover(calls: [id])
            #expect(summaries.statuses[id] == CallsListText(language: .russian).summaryStatus(.failed, false))
            await summaries.submit(call: id, input: "input", entries: [.init(label: "A", time: "0", text: "spoken")], finalWrite: true, usable: true)
            #expect(try Data(contentsOf: folder.appendingPathComponent(".summary-job.json")) == corrupt)
            #expect(summaries.statuses[id] == CallsListText(language: .russian).summaryStatus(.failed, false))
            await summaries.shutdown()
        }
    }

    @Test func shutdownJoinsHeldRecoveryAndLeavesItsJobPending() async throws {
        try await withComposeFolder { root in
            let id = "1970.01.01-0000"
            try FileManager.default.createDirectory(at: root.appendingPathComponent(id), withIntermediateDirectories: true)
            let preferences = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json"))
            try preferences.updateNotes(enabledNotes())
            let files = Files(locations: SummaryStorage(folder: root, timeZone: .gmt, trash: removeForTrash), disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let saved = savedJob(call: id)
            #expect(try await SummaryJobStore(files: files).claim(saved).owned)
            let readStarted = Signal(), releaseRead = Signal(), shutdownStarted = Signal()
            let runtime = Runtime(process: ArbitrationProcess(), http: ArbitrationHTTP(), credential: { _ in nil }, resolveProgram: { $0 }, deadline: { throw Failure.timeout })
            let summaries = AudelinSummaries(files: files, runtime: runtime, preferences: preferences, sink: TestLogSink(), callText: { _ in .init(notes: nil, transcript: []) }, date: { _ in "made" }, load: { call in
                readStarted.send(); await releaseRead.next(); return try await files.load(call: call)
            })
            let recovery = Task { await summaries.recover(calls: [id]) }
            await readStarted.next()
            let shutdown = Task { shutdownStarted.send(); await summaries.shutdown() }
            await shutdownStarted.next()
            releaseRead.send()
            await shutdown.value; await recovery.value
            #expect(try await files.load(call: id)?.phase == "pending")
            #expect(try await files.load(call: id)?.job == saved.id)
        }
    }

    @Test func statusesFollowTheLanguage() async throws {
        try await withComposeFolder { root in
            let preferences = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json"))
            try preferences.updateNotes(.init(enabled: true))
            let files = Files(locations: SummaryStorage(folder: root, timeZone: .gmt, trash: removeForTrash), disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let runtime = Runtime(process: ArbitrationProcess(), http: ArbitrationHTTP(), credential: { _ in nil }, resolveProgram: { $0 }, deadline: { throw Failure.timeout })
            let summaries = AudelinSummaries(files: files, runtime: runtime, preferences: preferences, sink: TestLogSink(), callText: { _ in .init(notes: nil, transcript: []) }, date: { _ in "made" })
            summaries.waiting(call: "call")
            #expect(summaries.statuses == ["call": CallsListText(language: .russian).summaryStatus(.waiting, false)])
            var updates = summaries.updates().makeAsyncIterator()
            _ = await updates.next()
            summaries.languageChanged(CallsListText(language: .english))
            let english = ["call": CallsListText(language: .english).summaryStatus(.waiting, false)]
            #expect(summaries.statuses == english)
            #expect(await updates.next() == english)
            await summaries.shutdown()
        }
    }
}
private struct ArbitrationProcess: ProcessRunning {
    func run(program: String, arguments: [String], input: Data) throws -> ProcessOutput { Issue.record("unexpected runtime dispatch"); throw Failure.unavailable }
}
private struct ArbitrationHTTP: HTTPRequesting {
    func request(url: URL, headers: [String: String], body: Data, loopback: Bool) throws -> HTTPResponse { Issue.record("unexpected runtime dispatch"); throw Failure.transport }
}

private func enabledNotes() -> NotesPreferences {
    let runtime = NotesPreferences.Runtime(kind: "compatibleAPI", model: "fixture", executable: "", endpoint: "http://127.0.0.1/v1", credentialVariable: "")
    return .init(enabled: true, speakers: false, primary: runtime, fallback: runtime)
}
private func savedJob(call: String) -> Job {
    let runtime = Job.Runtime(kind: "compatibleAPI", model: "saved-model", program: "", endpoint: "http://127.0.0.1/v1", credentialVariable: "")
    return .init(id: "saved-job", call: call, input: "saved-input", entries: [.init(label: "A", time: "0", text: "saved spoken")], speakers: false, primary: runtime, fallback: runtime)
}
private actor HeldSummaryHTTP: HTTPRequesting {
    nonisolated let started = Signal(), release = Signal()
    var requests = 0
    func request(url: URL, headers: [String: String], body: Data, loopback: Bool) async throws -> HTTPResponse {
        requests += 1; started.send(); await release.next()
        let notes = "## What this was about\n\nSpoken topic\n\n## Key points\n\n- Spoken point\n\n## Decisions\n\nNone recorded.\n\n## Actions\n\nNone recorded.\n"
        return .init(status: 200, body: try JSONSerialization.data(withJSONObject: ["choices": [["finish_reason": "stop", "message": ["content": notes]]]]))
    }
}

private func waitForCancellation() async throws {
    let never = AsyncStream<Void> { _ in }
    for await _ in never {}
    try Task.checkCancellation()
}

private actor JoinedCancellationHTTP: HTTPRequesting {
    nonisolated let started = Signal(), cancelled = Signal(), cleanup = Signal()
    var requests = 0
    func request(url: URL, headers: [String: String], body: Data, loopback: Bool) async throws -> HTTPResponse {
        requests += 1; started.send()
        do { try await waitForCancellation() }
        catch {
            cancelled.send()
            let cleanup = cleanup
            // Resource cleanup outlives request cancellation and is explicitly joined.
            await Task.detached { await cleanup.next() }.value
            throw Failure.cancelled
        }
        throw Failure.cancelled
    }
}

private enum ObserverReadFailure: Error { case unavailable }
private actor ObserverReads {
    private var results: [Result<Record?, ObserverReadFailure>]
    init(_ results: [Result<Record?, ObserverReadFailure>]) { self.results = results }
    func next() throws -> Record? {
        guard !results.isEmpty else { Issue.record("unexpected observer read"); throw ObserverReadFailure.unavailable }
        return try results.removeFirst().get()
    }
}

private actor HeldObserverRead {
    let files: Files
    let fails: Bool
    private(set) var count = 0
    nonisolated let started = Signal(), release = Signal()
    init(files: Files, fails: Bool) { self.files = files; self.fails = fails }
    func load(call: String) async throws -> Record? {
        count += 1
        let held = count == 2
        let record = try await files.load(call: call)
        if held {
            started.send(); await release.next()
            if fails { throw ObserverReadFailure.unavailable }
        }
        return record
    }
}
