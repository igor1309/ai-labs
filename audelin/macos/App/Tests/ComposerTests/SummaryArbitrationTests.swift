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
            try await offPool { try FileManager.default.createDirectory(at: root.appendingPathComponent(id), withIntermediateDirectories: true) }
            let preferences = await offPool { PreferencesStore(fileURL: root.appendingPathComponent("preferences.json")) }
            try await offPool { try preferences.updateNotes(.init(enabled: true)) }
            let files = Files(locations: SummaryStorage(folder: root, timeZone: .gmt), disk: FileDisk())
            let readStarted = Signal(), releaseRead = Signal(), submitStarted = Signal()
            let runtime = Runtime(process: ArbitrationProcess(), http: ArbitrationHTTP(), credential: { _ in nil }, deadline: { throw Failure.timeout })
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
}
private struct ArbitrationProcess: ProcessRunning {
    func run(program: String, arguments: [String], input: Data) throws -> ProcessOutput { Issue.record("unexpected runtime dispatch"); throw Failure.unavailable }
}
private struct ArbitrationHTTP: HTTPRequesting {
    func request(url: URL, headers: [String: String], body: Data, loopback: Bool) throws -> HTTPResponse { Issue.record("unexpected runtime dispatch"); throw Failure.transport }
}
