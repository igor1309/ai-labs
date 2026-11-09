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
            let files = Files(locations: SummaryStorage(folder: root, timeZone: .gmt), disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let readStarted = Signal(), releaseRead = Signal(), submitStarted = Signal()
            let runtime = Runtime(process: ArbitrationProcess(), http: ArbitrationHTTP(), credential: { _ in nil }, resolveProgram: { $0 }, deadline: { throw Failure.timeout })
            let summaries = AudelinSummaries(files: files, runtime: runtime, preferences: preferences, sink: TestLogSink(), load: { call in
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
    @Test func secondCompositionObservesHeldGenerationWithoutInvalidatingPublication() async throws {
        try await withComposeFolder { root in
            let id = "1970.01.01-0000"
            try FileManager.default.createDirectory(at: root.appendingPathComponent(id), withIntermediateDirectories: true)
            let preferences = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json"))
            try preferences.updateNotes(enabledNotes())
            let directory = root.appendingPathComponent("leases")
            let ownerFiles = Files(locations: SummaryStorage(folder: root, timeZone: .gmt), disk: FileDisk(), ownershipDirectory: directory)
            let observerFiles = Files(locations: SummaryStorage(folder: root, timeZone: .gmt), disk: FileDisk(), ownershipDirectory: directory)
            let http = HeldSummaryHTTP()
            let runtime = Runtime(process: ArbitrationProcess(), http: http, credential: { _ in nil }, resolveProgram: { $0 }, deadline: { try await waitForCancellation() })
            let owner = AudelinSummaries(files: ownerFiles, runtime: runtime, preferences: preferences, sink: TestLogSink())
            let observer = AudelinSummaries(files: observerFiles, runtime: runtime, preferences: preferences, sink: TestLogSink())
            await owner.submit(call: id, input: "input", entries: [.init(label: "A", time: "0", text: "spoken")], finalWrite: true, usable: true)
            await http.started.next()
            do {
                await observer.recover(calls: [id])
                #expect(observer.statuses[id] == "Готовим итоги…")
                #expect(try await observerFiles.load(call: id)?.phase == "running")
                await observer.submit(call: id, input: "duplicate", entries: [], finalWrite: false, usable: false)
                http.release.send()
                for await status in owner.updates() where status[id] == "Итоги готовы" { break }
                #expect(try await observerFiles.load(call: id)?.phase == "succeeded")
                #expect(await http.requests == 1)
                await owner.shutdown(); await observer.shutdown()
            } catch {
                http.release.send(); await owner.shutdown(); await observer.shutdown(); throw error
            }
        }
    }

    @Test func shutdownRetainsOwnershipUntilCancelledRequestCleanupIsJoined() async throws {
        try await withComposeFolder { root in
            let id = "1970.01.01-0000"
            try FileManager.default.createDirectory(at: root.appendingPathComponent(id), withIntermediateDirectories: true)
            let preferences = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json"))
            try preferences.updateNotes(enabledNotes())
            let directory = root.appendingPathComponent("leases")
            let ownerFiles = Files(locations: SummaryStorage(folder: root, timeZone: .gmt), disk: FileDisk(), ownershipDirectory: directory)
            let observerFiles = Files(locations: SummaryStorage(folder: root, timeZone: .gmt), disk: FileDisk(), ownershipDirectory: directory)
            let http = JoinedCancellationHTTP()
            let runtime = Runtime(process: ArbitrationProcess(), http: http, credential: { _ in nil }, resolveProgram: { $0 }, deadline: { try await waitForCancellation() })
            let summaries = AudelinSummaries(files: ownerFiles, runtime: runtime, preferences: preferences, sink: TestLogSink())
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
            let files = Files(locations: SummaryStorage(folder: root, timeZone: .gmt), disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let store = SummaryJobStore(files: files)
            let saved = savedJob(call: id)
            #expect(try await store.claim(saved).owned)
            let readStarted = Signal(), releaseRead = Signal(), submitStarted = Signal()
            let http = HeldSummaryHTTP()
            let runtime = Runtime(process: ArbitrationProcess(), http: http, credential: { _ in nil }, resolveProgram: { $0 }, deadline: { try await waitForCancellation() })
            let summaries = AudelinSummaries(files: files, runtime: runtime, preferences: preferences, sink: TestLogSink(), load: { call in
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
            let files = Files(locations: SummaryStorage(folder: root, timeZone: .gmt), disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let runtime = Runtime(process: ArbitrationProcess(), http: ArbitrationHTTP(), credential: { _ in nil }, resolveProgram: { $0 }, deadline: { throw Failure.timeout })
            let summaries = AudelinSummaries(files: files, runtime: runtime, preferences: preferences, sink: TestLogSink())
            await summaries.recover(calls: [id])
            #expect(summaries.statuses[id] == summaryStatus(.failed, false))
            await summaries.submit(call: id, input: "input", entries: [.init(label: "A", time: "0", text: "spoken")], finalWrite: true, usable: true)
            #expect(try Data(contentsOf: folder.appendingPathComponent(".summary-job.json")) == corrupt)
            #expect(summaries.statuses[id] == summaryStatus(.failed, false))
            await summaries.shutdown()
        }
    }

    @Test func shutdownJoinsHeldRecoveryAndLeavesItsJobPending() async throws {
        try await withComposeFolder { root in
            let id = "1970.01.01-0000"
            try FileManager.default.createDirectory(at: root.appendingPathComponent(id), withIntermediateDirectories: true)
            let preferences = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json"))
            try preferences.updateNotes(enabledNotes())
            let files = Files(locations: SummaryStorage(folder: root, timeZone: .gmt), disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let saved = savedJob(call: id)
            #expect(try await SummaryJobStore(files: files).claim(saved).owned)
            let readStarted = Signal(), releaseRead = Signal(), shutdownStarted = Signal()
            let runtime = Runtime(process: ArbitrationProcess(), http: ArbitrationHTTP(), credential: { _ in nil }, resolveProgram: { $0 }, deadline: { throw Failure.timeout })
            let summaries = AudelinSummaries(files: files, runtime: runtime, preferences: preferences, sink: TestLogSink(), load: { call in
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
        let notes = #"{"language":"en","topic":"Spoken topic","keyPoints":["Spoken point"],"decisions":[],"actions":[]}"#
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
