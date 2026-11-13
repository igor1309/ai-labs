import BlockingTestWork
import Foundation
import Preferences
import SummaryFiles
import SummaryJobs
import SummaryRuntime
import Testing
@testable import Composer

@MainActor @Suite(.timeLimit(.minutes(1)))
struct SummaryRecoveryDispatchTests {
    @Test(arguments: [false, true], [false, true])
    func savedSnapshotDispatchesAtStartupOrOnExplicitInterruptedRetry(hasFallback: Bool, interrupted: Bool) async throws {
        try await withComposeFolder { root in
            let call = "1970.01.01-0000", folder = root.appendingPathComponent("1970.01.01-0000")
            do {
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                try Data("newer transcript must not replace snapshot".utf8).write(to: folder.appendingPathComponent("transcript.md"))
            }
            let saved = Job.Runtime(kind: "compatibleAPI", model: "saved-model", program: "", endpoint: "http://127.0.0.1:8181/saved", credentialVariable: "")
            let job = Job(id: "never-started", call: call, input: "saved-input", entries: [.init(label: "A", time: "00:17", text: "Saved spoken input")], speakers: false, primary: saved, fallback: hasFallback ? saved : nil)
            let initial = Files(locations: SummaryStorage(folder: root, timeZone: .gmt, trash: removeForTrash), disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            #expect(try await SummaryJobStore(files: initial).claim(job).owned)
            if interrupted {
                #expect(try await initial.start(SummaryJobStore(files: initial).record(job)))
                await initial.release(job: job.id, call: call, input: job.input)
                #expect(try await initial.load(call: call)?.phase == "interrupted")
                try Data("previous notes".utf8).write(to: folder.appendingPathComponent("summary.md"))
            }
            let current = NotesPreferences.Runtime(kind: "compatibleAPI", model: "current-model", executable: "", endpoint: "http://127.0.0.1:9191/current", credentialVariable: "")
            let preferences = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json"))
            try preferences.write(Preferences(notes: .init(enabled: true, primary: current, fallback: current), automaticRecording: false, callsFolder: root))
            let files = Files(locations: SummaryStorage(folder: root, timeZone: .gmt, trash: removeForTrash), disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let http = RecoveryHTTP()
            let runtime = Runtime(process: RecoveryNoProcess(), http: http, credential: { _ in nil }, resolveProgram: { $0 }, deadline: {
                let never = AsyncStream<Void> { _ in }
                for await _ in never {}
                try Task.checkCancellation()
            })
            let loads = Values<String>()
            let summaries = AudelinSummaries(files: files, runtime: runtime, preferences: preferences, sink: TestLogSink(), callText: { _ in .init(notes: nil, transcript: []) }, date: { _ in "made" }, load: { call in
                loads.append(call); return try await files.load(call: call)
            })
            do {
                await summaries.recover(calls: [call, call])
                if interrupted {
                    #expect(summaries.retryable == [call])
                    #expect(await http.requests.isEmpty)
                    #expect(!summaries.busy)
                    try await summaries.retry(call: call)
                    #expect(summaries.busy)
                    #expect(try String(contentsOf: folder.appendingPathComponent("summary.md"), encoding: .utf8) == "previous notes")
                }
                await http.started.next()
                #expect(summaries.busy)
                await #expect(throws: (any Error).self) { try await summaries.retry(call: call) }
                await summaries.recover(calls: [call])
                let requests = await http.requests
                #expect(requests.count == 1)
                let request = try #require(requests.first)
                #expect(request.url.absoluteString == "http://127.0.0.1:8181/saved/chat/completions")
                #expect(request.loopback)
                #expect(request.headers == ["Content-Type": "application/json"])
                let payload = try JSONDecoder().decode(RecoveryRequest.self, from: request.body)
                #expect(payload.model == "saved-model")
                #expect(payload.messages.map(\.content) == [NotesResponse.prompt + "\nACCEPTED EVIDENCE:\n\nTRANSCRIPT DATA:\n[00:17] A: Saved spoken input"])
                #expect(loads.all == (interrupted ? [call, call] : [call]))
                http.release.send()
                for await statuses in summaries.updates() where statuses[call] == "Итоги готовы" { break }
                let record = try #require(try await files.load(call: call))
                #expect(record.phase == "succeeded")
                #expect((record.job != job.id) == interrupted)
                #expect(record.input == "saved-input" && !record.warning)
                var expected = job; expected.id = record.job
                #expect(try SummaryJobStore(files: files).state(record).job == expected)
                #expect(!summaries.busy && summaries.retryable.isEmpty)
                await #expect(throws: (any Error).self) { try await summaries.retry(call: call) }
                let output = try String(contentsOf: folder.appendingPathComponent("summary.md"), encoding: .utf8)
                #expect(output.hasSuffix(recoveredNotes))
                #expect(await http.requests.count == 1)
                await summaries.shutdown()
            } catch { http.release.send(); await summaries.shutdown(); throw error }
        }
    }
}
private struct RecoveryRequest: Decodable {
    struct Message: Decodable { let content: String }
    let model: String
    let messages: [Message]
}
private let recoveredNotes = "## What this was about\n\nRecovered meeting\n\n## Key points\n\n- Saved spoken input\n\n## Decisions\n\nNone recorded.\n\n## Actions\n\nNone recorded.\n"
private actor RecoveryHTTP: HTTPRequesting {
    struct Request: Sendable { let url: URL; let headers: [String: String]; let body: Data; let loopback: Bool }
    var requests: [Request] = []
    nonisolated let started = Signal(), release = Signal()
    func request(url: URL, headers: [String: String], body: Data, loopback: Bool) async throws -> HTTPResponse {
        requests.append(.init(url: url, headers: headers, body: body, loopback: loopback))
        started.send(); await release.next(); try Task.checkCancellation()
        return .init(status: 200, body: try JSONSerialization.data(withJSONObject: ["choices": [["finish_reason": "stop", "message": ["content": recoveredNotes]]]]))
    }
}
private struct RecoveryNoProcess: ProcessRunning {
    func run(program: String, arguments: [String], input: Data) throws -> ProcessOutput { Issue.record("unexpected process request"); throw Failure.unavailable }
}
