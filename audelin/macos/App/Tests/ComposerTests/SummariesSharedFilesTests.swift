import BlockingTestWork
import Calls
import CallsListUI
import CallsStorage
import Foundation
import Preferences
import SummaryFiles
import SummaryJobs
import SummaryRuntime
import Testing
@testable import Composer

/// Two app instances, or one instance and what an earlier one left, over the same summary files.
@MainActor @Suite(.timeLimit(.minutes(1))) struct SummariesSharedFilesTests {
    let id = "1970.01.01-0000"
    let text = CallsListText(language: .russian)

    @Test(arguments: [false, true])
    func anotherInstancesRunningJobIsObservedToItsEnd(recoverObserver: Bool) async throws {
        try await withComposeFolder { root in
            try makeCall(root)
            let http = HeldHTTP()
            let owner = makeSUT(root, http: http), observer = makeSUT(root, http: http)
            owner.send(.finalized(id, entries: [spoken], finalWrite: true, usable: true))
            await http.started.next()
            do {
                if recoverObserver { observer.recover(calls: [id]) }
                else { observer.send(.finalized(id, entries: [.init(label: "B", time: "0", text: "competing")], finalWrite: true, usable: true)) }
                await until(observer) { $0.calls[id]?.stage == .observed }
                #expect(observer.statuses[id] == text.summariesStatus(.observed, false))
                #expect(owner.busy && observer.busy)
                await #expect(throws: (any Error).self) { try await observer.retry(call: id) }
                #expect(try await phase(root) == "running")
                http.release.send()
                for await status in owner.updates() where status[id] == "Итоги готовы" { break }
                await observer.refresh()
                #expect(!owner.busy && !observer.busy && observer.statuses[id] == "Итоги готовы")
                #expect(await http.requests == 1)
                await owner.shutdown(); await observer.shutdown()
            } catch { http.release.send(); await owner.shutdown(); await observer.shutdown(); throw error }
        }
    }

    @Test(arguments: [false, true])
    func anInterruptedJobAnotherInstanceRetriesIsFollowed(retryFirst: Bool) async throws {
        try await withComposeFolder { root in
            try makeCall(root)
            try await storeInterrupted(root)
            let http = HeldHTTP()
            let owner = makeSUT(root, http: http), observer = makeSUT(root, http: http)
            owner.recover(calls: [id]); observer.recover(calls: [id])
            await until(owner) { $0.calls[id]?.stage == .interrupted }
            await until(observer) { $0.calls[id]?.stage == .interrupted }
            #expect(owner.retryable == [id] && observer.retryable == [id] && !observer.busy)
            do {
                try await owner.retry(call: id)
                await http.started.next()
                if retryFirst { await #expect(throws: (any Error).self) { try await observer.retry(call: id) } }
                await observer.refresh()
                #expect(observer.busy && observer.retryable.isEmpty && observer.statuses[id] == text.summariesStatus(.observed, false))
                http.release.send()
                for await status in owner.updates() where status[id] == "Итоги готовы" { break }
                await observer.refresh()
                #expect(!observer.busy && observer.statuses[id] == "Итоги готовы")
                #expect(await http.requests == 1)
                await owner.shutdown(); await observer.shutdown()
            } catch { http.release.send(); await owner.shutdown(); await observer.shutdown(); throw error }
        }
    }

    @Test func shutdownKeepsTheJobRunningUntilItsRequestHasCleanedUp() async throws {
        try await withComposeFolder { root in
            try makeCall(root)
            let http = CleanupHTTP()
            let sut = makeSUT(root, http: http)
            sut.send(.finalized(id, entries: [spoken], finalWrite: true, usable: true))
            await http.started.next()
            let shutdown = Task { await sut.shutdown() }
            await http.cancelled.next()
            do {
                #expect(try await phase(root) == "running")
                http.cleanup.send(); await shutdown.value
                #expect(try await phase(root) == "interrupted")
                #expect(await http.requests == 1)
            } catch { http.cleanup.send(); await shutdown.value; throw error }
        }
    }

    @Test func aCorruptRecordIsNotReplacedByACompletion() async throws {
        try await withComposeFolder { root in
            let corrupt = Data("{broken".utf8), record = root.appendingPathComponent(id).appendingPathComponent(".summary-job.json")
            try makeCall(root); try corrupt.write(to: record)
            let sut = makeSUT(root, http: UnusedHTTP())
            sut.recover(calls: [id])
            await until(sut) { $0.calls[id]?.stage == .failed }
            sut.send(.finalized(id, entries: [spoken], finalWrite: true, usable: true))
            // Shutdown returns once nothing is in flight, so the completion has been handled.
            await sut.shutdown()
            #expect(try Data(contentsOf: record) == corrupt)
            #expect(sut.statuses[id] == text.summariesStatus(.failed, false))
        }
    }

    @Test func aRecoveredPendingJobWaitsWhileDispatchIsStopped() async throws {
        try await withComposeFolder { root in
            try makeCall(root)
            _ = try await port(root).claim(saved)
            let sut = makeSUT(root, http: UnusedHTTP())
            sut.stopDispatch()
            sut.recover(calls: [id])
            await until(sut) { $0.calls[id]?.stage == .pending }
            #expect(sut.statuses[id] == "Итоги ожидают запуска")
            #expect(try await phase(root) == "pending")
            await sut.shutdown()
            #expect(try await files(root).load(call: id)?.job == saved.id)
        }
    }

    @Test(arguments: [false, true])
    func aRecoveredJobRunsItsSavedSnapshotAndRuntime(interrupted: Bool) async throws {
        try await withComposeFolder { root in
            try makeCall(root)
            let folder = root.appendingPathComponent(id)
            try Data("newer transcript must not replace snapshot".utf8).write(to: folder.appendingPathComponent("transcript.md"))
            if interrupted {
                try await storeInterrupted(root)
                try Data("previous notes".utf8).write(to: folder.appendingPathComponent("summary.md"))
            } else { _ = try await port(root).claim(saved) }
            let http = HeldHTTP()
            let sut = makeSUT(root, http: http)
            do {
                sut.recover(calls: [id, id])
                if interrupted {
                    await until(sut) { $0.calls[id]?.stage == .interrupted }
                    #expect(sut.retryable == [id] && !sut.busy); #expect(await http.requests == 0)
                    try await sut.retry(call: id)
                    #expect(try String(contentsOf: folder.appendingPathComponent("summary.md"), encoding: .utf8) == "previous notes")
                }
                await http.started.next()
                #expect(sut.busy)
                await #expect(throws: (any Error).self) { try await sut.retry(call: id) }
                let request = try #require(await http.bodies.first)
                #expect(await http.urls == ["http://127.0.0.1:8181/saved/chat/completions"])
                let payload = try JSONDecoder().decode(SentRequest.self, from: request)
                #expect(payload.model == "saved-model")
                #expect(payload.messages.map(\.content) == [NotesResponse.prompt + "\nACCEPTED EVIDENCE:\n\nTRANSCRIPT DATA:\n[0] A: saved spoken"])
                http.release.send()
                for await status in sut.updates() where status[id] == "Итоги готовы" { break }
                let record = try #require(try await files(root).load(call: id))
                #expect(record.phase == "succeeded" && (record.job != saved.id) == interrupted && record.input == saved.input)
                #expect(!sut.busy && sut.retryable.isEmpty)
                #expect(try String(contentsOf: folder.appendingPathComponent("summary.md"), encoding: .utf8).hasSuffix(heldNotes))
                #expect(await http.requests == 1)
                await sut.shutdown()
            } catch { http.release.send(); await sut.shutdown(); throw error }
        }
    }

    @Test func statusesFollowTheLanguage() async throws {
        try await withComposeFolder { root in
            let sut = makeSUT(root, http: UnusedHTTP())
            sut.waiting(call: "call", notesOn: true)
            let russian = ["call": text.summariesStatus(.waiting, false)]
            for await value in sut.updates() where value == russian { break }
            var updates = sut.updates().makeAsyncIterator()
            #expect(await updates.next() == russian)
            sut.languageChanged(CallsListText(language: .english))
            let english = ["call": CallsListText(language: .english).summariesStatus(.waiting, false)]
            #expect(sut.statuses == english)
            #expect(await updates.next() == english)
            await sut.shutdown()
        }
    }

    private func until(_ sut: SummariesModel, _ holds: (SummariesState) -> Bool) async {
        for await state in Observations({ sut.state }) where holds(state) { return }
    }
    private var spoken: Job.Entry { .init(label: "A", time: "0", text: "spoken") }
    private var saved: Job {
        let runtime = Job.Runtime(kind: "compatibleAPI", model: "saved-model", program: "", endpoint: "http://127.0.0.1:8181/saved", credentialVariable: "")
        return .init(id: "saved-job", call: id, input: "saved-input", entries: [.init(label: "A", time: "0", text: "saved spoken")],
                     speakers: false, primary: runtime, fallback: runtime)
    }
    private func makeCall(_ root: URL) throws {
        try FileManager.default.createDirectory(at: root.appendingPathComponent(id), withIntermediateDirectories: true)
    }
    /// A job an earlier instance started and left without finishing.
    private func storeInterrupted(_ root: URL) async throws {
        let files = files(root), port = SummariesFilesPort(files: files, makeID: { UUID().uuidString })
        #expect(try await port.claim(saved).owned)
        #expect(try await port.start(saved))
        await port.release(saved)
        #expect(try await files.load(call: id)?.phase == "interrupted")
    }
    private func files(_ root: URL) -> Files {
        Files(locations: callsStorage(folder: root, timeZone: .gmt, trash: removeForTrash), disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
    }
    private func port(_ root: URL) -> SummariesFilesPort { .init(files: files(root), makeID: { UUID().uuidString }) }
    private func phase(_ root: URL) async throws -> String? { try await files(root).load(call: id)?.phase }
    private func makeSUT(_ root: URL, http: any HTTPRequesting) -> SummariesModel {
        let current = NotesPreferences.Runtime(kind: "compatibleAPI", model: "current-model", executable: "", endpoint: "http://127.0.0.1:9191/current", credentialVariable: "")
        let runtime = Runtime(process: NoProcess(), http: http, credential: { _ in nil }, resolveProgram: { $0 }, deadline: {
            let never = AsyncStream<Void> { _ in }
            for await _ in never {}
            try Task.checkCancellation()
        })
        return SummariesModel(text: { CallsListText(language: .russian) },
                              preparation: SummariesPreparationPort(notes: { .init(enabled: true, speakers: false, primary: current, fallback: current) },
                                                                    makeID: { UUID().uuidString }, callText: { _ in .init(notes: nil, transcript: []) }),
                              files: port(root), generation: SummaryGeneration(runtime: runtime, sink: TestLogSink()))
    }
}

private struct SentRequest: Decodable {
    struct Message: Decodable { let content: String }
    let model: String
    let messages: [Message]
}
private let heldNotes = "## What this was about\n\nSpoken topic\n\n## Key points\n\n- Spoken point\n\n## Decisions\n\nNone recorded.\n\n## Actions\n\nNone recorded.\n"
/// Answers each request with notes once released.
private actor HeldHTTP: HTTPRequesting {
    nonisolated let started = Signal(), release = Signal()
    var requests: Int { urls.count }
    private(set) var urls: [String] = []
    private(set) var bodies: [Data] = []
    func request(url: URL, headers: [String: String], body: Data, loopback: Bool) async throws -> HTTPResponse {
        urls.append(url.absoluteString); bodies.append(body); started.send(); await release.next(); try Task.checkCancellation()
        return .init(status: 200, body: try JSONSerialization.data(withJSONObject: ["choices": [["finish_reason": "stop", "message": ["content": heldNotes]]]]))
    }
}
/// Holds each request until cancelled, then cleans up once told to.
private actor CleanupHTTP: HTTPRequesting {
    nonisolated let started = Signal(), cancelled = Signal(), cleanup = Signal()
    var requests = 0
    func request(url: URL, headers: [String: String], body: Data, loopback: Bool) async throws -> HTTPResponse {
        requests += 1; started.send()
        let never = AsyncStream<Void> { _ in }
        for await _ in never {}
        cancelled.send()
        let cleanup = cleanup
        await Task.detached { await cleanup.next() }.value
        throw Failure.cancelled
    }
}
private struct UnusedHTTP: HTTPRequesting {
    func request(url: URL, headers: [String: String], body: Data, loopback: Bool) throws -> HTTPResponse { Issue.record("unexpected request"); throw Failure.transport }
}
private struct NoProcess: ProcessRunning {
    func run(program: String, arguments: [String], input: Data) throws -> ProcessOutput { Issue.record("unexpected process"); throw Failure.unavailable }
}
