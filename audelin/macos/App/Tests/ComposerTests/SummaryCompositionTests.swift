import BlockingTestWork
import CallsListUI
import Foundation
import Observation
import Preferences
import SummaryFiles
import SummaryJobs
import SummaryRuntime
import Testing
@testable import Composer

@MainActor @Suite(.timeLimit(.minutes(1)))
struct SummaryCompositionTests {
    @Test func defaultOffFinishesTheCallWithoutClaimingOrRequestingNotes() async throws {
        try await withComposeFolder { root in
            let http = ControlledHTTP(hold: false)
            let runtime = Runtime(process: NoProcess(), http: http, credential: { _ in nil }, resolveProgram: { $0 }, deadline: { try await waitForCancellation() })
            let rig = try await ComposeFixture.make(root: root,
                preferences: Preferences(automaticRecording: false, callsFolder: root), summaryRuntime: runtime)
            do {
                try await rig.start(); await rig.mine.heard.next(); await rig.theirs.heard.next()
                try await rig.stop()
                #expect(await http.count == 0)
                #expect(try await transcriptText(of: rig).contains("final"))
                let folder = rig.folder()
                #expect({
                    !FileManager.default.fileExists(atPath: folder.appendingPathComponent(".summary-job.json").path)
                    && !FileManager.default.fileExists(atPath: folder.appendingPathComponent("summary.md").path)
                }())
                for await statuses in rig.menu.summaryStates() {
                    #expect(statuses.values.allSatisfy { $0.isEmpty })
                    break
                }
                await rig.finish()
            } catch { await rig.finish(); throw error }
        }
    }
    @Test(arguments: [false, true])
    func exhaustedAttemptsKeepTheCallAndExposeFailureOrSpeakerWarning(speakerWarning: Bool) async throws {
        try await withComposeFolder { root in
            let http = ControlledHTTP(hold: false, failures: 2)
            let rig = try await fixture(root: root, storage: ControlledTranscripts(), http: http, speakers: speakerWarning)
            do {
                try await rig.start(); await rig.mine.heard.next(); await rig.theirs.heard.next()
                try await rig.stop()
                let expected = speakerWarning
                    ? "Итоги готовы; имена не определены"
                    : "Не удалось составить или сохранить итоги. Расшифровка и аудио сохранены."
                _ = try await summary(rig.menu) { $0.values.contains(expected) }
                rig.menu.calls?.show()
                for await state in Observations({ rig.menu.calls!.state }) where !state.rows.isEmpty {
                    #expect(state.rows[0].summaryStatus == expected)
                    break
                }
                #expect(await http.count == (speakerWarning ? 3 : 2))
                let transcript = try await transcriptText(of: rig)
                #expect(transcript.contains("mine final") && transcript.contains("theirs final"))
                let output = rig.folder().appendingPathComponent("summary.md")
                if speakerWarning {
                    #expect(try await read(output).contains("Synthetic meeting"))
                    let body = await http.lastBody
                    #expect(body.contains("Me:") && body.contains("Them:"))
                } else {
                    #expect(!FileManager.default.fileExists(atPath: output.path))
                }
                await rig.finish()
            } catch { await rig.finish(); throw error }
        }
    }
    @Test func waitForFinalWriteThenPublishAndShowStatus() async throws {
        try await withComposeFolder { root in
            let storage = ControlledTranscripts(holdFinal: true), http = ControlledHTTP(hold: false)
            let rig = try await fixture(root: root, storage: storage, http: http)
            do {
                try await rig.start(); await rig.mine.heard.next(); await rig.theirs.heard.next()
                let stopping = Task { try await rig.stop() }
                await storage.held.next()
                #expect(await http.count == 0)
                let waiting = try await summary(rig.menu) { $0.values.contains { $0.contains("финальную") } }
                #expect(waiting.count == 1)
                storage.release.send()
                try await stopping.value
                _ = try await summary(rig.menu) { $0.values.contains("Итоги готовы") }
                let transcript = try await transcriptText(of: rig)
                #expect(transcript.contains("mine final"))
                let output = try await read(rig.folder().appendingPathComponent("summary.md"))
                #expect(output.contains("## What this was about"))
                #expect(output.contains("None recorded."))
                rig.menu.calls?.show()
                for await state in Observations({ rig.menu.calls!.state }) where !state.rows.isEmpty {
                    #expect(state.rows[0].summaryStatus == "Итоги готовы")
                    break
                }
                #expect(await http.count == 1)
                await rig.finish()
            } catch { storage.release.send(); await rig.finish(); throw error }
        }
    }
    @Test func disablingAutomaticNotesDuringFinalWriteAllowsMakingOnRequest() async throws {
        try await withComposeFolder { root in
            let storage = ControlledTranscripts(holdFinal: true), http = ControlledHTTP(hold: false)
            let rig = try await fixture(root: root, storage: storage, http: http)
            do {
                try await rig.start(); await rig.mine.heard.next(); await rig.theirs.heard.next()
                let stopping = Task { try await rig.stop() }
                await storage.held.next()
                let settings = try #require(rig.menu.summarySettings)
                for await state in Observations({ settings.snapshot }) where state.phase == .saved { break }
                settings.send(.setAutomaticNotes(false))
                for await state in Observations({ settings.snapshot }) where state.phase == .editing { break }
                settings.send(.notesAction(.save))
                for await state in Observations({ settings.snapshot }) where state.phase == .saved { break }
                storage.release.send(); try await stopping.value
                let calls = try #require(rig.menu.calls)
                await rig.menu.perform(.showCalls)
                for await state in Observations({ calls.state }) where !state.busy && state.rows.count == 1 { break }
                #expect(await http.count == 0)
                try #require(calls.state.rows[0].canMakeSummary)
                #expect(calls.state.rows[0].summaryStatus.isEmpty)
                await calls.send(.makeSummary("1970.01.01-0000"))
                _ = try await summary(rig.menu) { $0.values.contains("Итоги готовы") }
                #expect(await http.count == 1)
                await rig.finish()
            } catch { storage.release.send(); await rig.finish(); throw error }
        }
    }

    @Test(arguments: [false, true])
    func latestWriteOverridesEarlierOutcome(finalFails: Bool) async throws {
        try await withComposeFolder { root in
            let storage = ControlledTranscripts(failEarly: !finalFails, failFinal: finalFails), http = ControlledHTTP(hold: false)
            let rig = try await fixture(root: root, storage: storage, http: http)
            do {
                try await rig.start(); await rig.mine.heard.next(); await rig.theirs.heard.next()
                // A successful partial write exists before the final snapshot is rejected.
                if finalFails { await storage.written.next() }
                try await rig.stop()
                _ = try await summary(rig.menu) { statuses in
                    statuses.values.contains { finalFails ? $0.contains("недоступны") : $0 == "Итоги готовы" }
                }
                #expect(await http.count == (finalFails ? 0 : 1))
                #expect(FileManager.default.fileExists(atPath: rig.folder().appendingPathComponent("transcript.md").path))
                await rig.finish()
            } catch { await rig.finish(); throw error }
        }
    }
    @Test func nextCallStartsWhilePreviousGenerationIsHeldAndQuitJoinsCancellation() async throws {
        try await withComposeFolder { root in
            let storage = ControlledTranscripts(), http = ControlledHTTP(hold: true)
            let rig = try await fixture(root: root, storage: storage, http: http)
            do {
                try await rig.start(); await rig.mine.heard.next(); await rig.theirs.heard.next()
                try await rig.stop(); await http.started.next()
                try await rig.start()
                for await state in Observations({ rig.menu.state }) where state.phase == .recording { break }
                #expect(await http.count == 1)
                await rig.finish()
                #expect(await http.cancelled)
                // Active work is never replayed; the second handoff is retained pending.
                let records = try {
                    try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).compactMap { folder -> String? in
                        let path = folder.appendingPathComponent(".summary-job.json")
                        guard let bytes = try? Data(contentsOf: path), let object = try JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { return nil }
                        return object["phase"] as? String
                    }
                }()
                #expect(records.sorted() == ["pending", "running"])
                #expect(await http.count == 1)
            } catch { await rig.finish(); throw error }
        }
    }
    @Test(arguments: [false, true])
    func callsListRetriesOnlyOnRequestAndShowsRetryErrors(retryFails: Bool) async throws {
        try await withComposeFolder { root in
            let id = "1970.01.01-0000", folder = root.appendingPathComponent("1970.01.01-0000")
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try Data("saved transcript".utf8).write(to: folder.appendingPathComponent("transcript.md"))
            try Data("previous notes".utf8).write(to: folder.appendingPathComponent("summary.md"))
            let files = Files(locations: SummaryStorage(folder: root, timeZone: .gmt, trash: removeForTrash), disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("summary-ownership"))
            let runtime = Job.Runtime(kind: "compatibleAPI", model: "saved", program: "", endpoint: "http://127.0.0.1/v1", credentialVariable: "")
            let job = Job(id: "interrupted", call: id, input: "saved-input", entries: [.init(label: "A", time: "0", text: "saved transcript")], speakers: false, primary: runtime)
            _ = try await files.claim(SummaryJobStore(files: files).record(job, phase: "interrupted"))
            let http = ControlledHTTP(hold: true)
            let rig = try await fixture(root: root, storage: ControlledTranscripts(), http: http)
            do {
                let calls = try #require(rig.menu.calls)
                calls.show()
                for await state in Observations({ calls.state }) where !state.busy && !state.rows.isEmpty { break }
                #expect(calls.state.rows.first?.canRetrySummary == true)
                #expect(calls.state.rows.first?.summary == .failed)
                #expect(await http.count == 0)
                if retryFails { try Data("{broken".utf8).write(to: folder.appendingPathComponent(".summary-job.json")) }
                await calls.send(.retrySummary(id))
                if retryFails {
                    #expect(calls.state.failure == "Не удалось повторить подготовку итогов. Расшифровка и прежние итоги сохранены.")
                    #expect(calls.state.rows.first?.canRetrySummary == true)
                    #expect(await http.count == 0)
                } else {
                    await http.started.next()
                    #expect(calls.state.rows.first?.canRetrySummary == false)
                    #expect(calls.state.rows.first?.summary == .pending)
                    await calls.send(.retrySummary(id))
                    #expect(await http.count == 1)
                    #expect(try await files.load(call: id)?.job != job.id)
                }
                #expect(try await files.notes(call: id)?.text == "previous notes")
                #expect(try String(contentsOf: folder.appendingPathComponent("transcript.md"), encoding: .utf8) == "saved transcript")
                if !retryFails {
                    http.complete.send()
                    _ = try await summary(rig.menu) { $0[id] == "Итоги готовы" }
                    #expect(calls.state.rows.first?.summary == CallsListState.Row.Summary.none)
                    #expect(try await files.load(call: id)?.phase == "succeeded")
                }
                await rig.finish()
            } catch { http.complete.send(); await rig.finish(); throw error }
        }
    }
    @Test func deletingInterruptedCallReleasesUpdateProtection() async throws {
        try await withComposeFolder { root in
            let id = "1970.01.01-0000", folder = root.appendingPathComponent("1970.01.01-0000")
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let files = Files(locations: SummaryStorage(folder: root, timeZone: .gmt, trash: removeForTrash), disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("summary-ownership"))
            let runtime = Job.Runtime(kind: "compatibleAPI", model: "saved", program: "", endpoint: "http://127.0.0.1/v1", credentialVariable: "")
            let job = Job(id: "interrupted", call: id, input: "saved", entries: [.init(label: "A", time: "0", text: "spoken")], speakers: false, primary: runtime)
            _ = try await files.claim(SummaryJobStore(files: files).record(job, phase: "interrupted"))
            let rig = try await fixture(root: root, storage: ControlledTranscripts(), http: ControlledHTTP(hold: false))
            do {
                let calls = try #require(rig.menu.calls)
                calls.show()
                for await state in Observations({ calls.state }) where !state.busy && state.rows.count == 1 { break }
                #expect(calls.state.rows.first?.canRetrySummary == true)
                await calls.send(.askDelete(id)); await calls.send(.confirmDelete)
                for await state in Observations({ calls.state }) where !state.busy && state.rows.isEmpty { break }
                #expect(!FileManager.default.fileExists(atPath: folder.path))
                var relaunched = false
                #expect(await rig.menu.relaunchIfIdle { relaunched = true })
                #expect(relaunched)
                calls.windowClosed()
                await rig.finish()
            } catch { await rig.finish(); throw error }
        }
    }

    @Test(arguments: [false, true])
    func retryCompletionRefreshesTheOpenCallsWindowAndDetail(previousNotes: Bool) async throws {
        try await withComposeFolder { root in
            let id = "1970.01.01-0000", folder = root.appendingPathComponent("1970.01.01-0000")
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try Data("saved transcript".utf8).write(to: folder.appendingPathComponent("transcript.md"))
            if previousNotes { try Data("previous notes".utf8).write(to: folder.appendingPathComponent("summary.md")) }
            let otherID = "1970.01.01-0001", otherFolder = root.appendingPathComponent("1970.01.01-0001")
            try FileManager.default.createDirectory(at: otherFolder, withIntermediateDirectories: true)
            try Data("other transcript".utf8).write(to: otherFolder.appendingPathComponent("transcript.md"))
            try Data("other notes".utf8).write(to: otherFolder.appendingPathComponent("summary.md"))
            let files = Files(locations: SummaryStorage(folder: root, timeZone: .gmt, trash: removeForTrash), disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("summary-ownership"))
            let runtime = Job.Runtime(kind: "compatibleAPI", model: "saved", program: "", endpoint: "http://127.0.0.1/v1", credentialVariable: "")
            let job = Job(id: "interrupted", call: id, input: "saved-input", entries: [.init(label: "A", time: "0", text: "saved transcript")], speakers: false, primary: runtime)
            _ = try await files.claim(SummaryJobStore(files: files).record(job, phase: "interrupted"))
            let http = ControlledHTTP(hold: true)
            let rig = try await fixture(root: root, storage: ControlledTranscripts(), http: http)
            do {
                let calls = try #require(rig.menu.calls)
                calls.show()
                // The other call's notes confirm the initial scan completed even when this call has no notes.
                for await state in Observations({ calls.state }) where !state.busy &&
                    state.rows.first(where: { $0.id == otherID })?.hasNotes == true &&
                    state.rows.first(where: { $0.id == id })?.hasNotes == previousNotes { break }
                let rows = calls.state.rows.map(\.id)
                await calls.send(.select(id))
                if previousNotes {
                    for await detail in Observations({ calls.detail }) where notesText(detail) == "previous notes" { break }
                }
                await calls.send(.retrySummary(id))
                await http.started.next()
                #expect(calls.state.rows.first(where: { $0.id == id })?.hasNotes == previousNotes)
                if previousNotes { #expect(notesText(calls.detail) == "previous notes") }
                http.complete.send()
                _ = try await summary(rig.menu) { $0[id] == "Итоги готовы" }
                let published = try #require(try await files.notes(call: id)?.text)
                for await state in Observations({ calls.state }) where state.rows.first(where: { $0.id == id })?.hasNotes == true { break }
                #expect(calls.state.rows.map(\.id) == rows)
                for await detail in Observations({ calls.detail }) where notesText(detail) == published { break }
                #expect(calls.detail?.id == id)
                #expect(published.contains("Synthetic meeting"))
                #expect(calls.state.failure == nil)
                calls.windowClosed()
                await rig.finish()
            } catch { http.complete.send(); rig.menu.calls?.windowClosed(); await rig.finish(); throw error }
        }
    }
    @Test(arguments: ["succeeded", "failed"])
    func updateObservesAnotherInstancesRunningJobUntilItsTerminalSave(terminal: String) async throws {
        try await withComposeFolder { root in
            let id = "1970.01.01-0000", folder = root.appendingPathComponent("1970.01.01-0000")
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let owner = Files(locations: SummaryStorage(folder: root, timeZone: .gmt, trash: removeForTrash), disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("summary-ownership"))
            let runtime = Job.Runtime(kind: "compatibleAPI", model: "saved", program: "", endpoint: "http://127.0.0.1/v1", credentialVariable: "")
            let job = Job(id: "other-owner", call: id, input: "saved-input", entries: [.init(label: "A", time: "0", text: "saved transcript")], speakers: false, primary: runtime)
            let record = try SummaryJobStore(files: owner).record(job, phase: "pending")
            _ = try await owner.claim(record)
            #expect(try await owner.start(record))
            let http = ControlledHTTP(hold: false)
            let rig = try await fixture(root: root, storage: ControlledTranscripts(), http: http)
            do {
                #expect(await !rig.menu.relaunchIfIdle { Issue.record("relaunched during another owner's generation") })
                try await owner.publish(record, notes: "complete output")
                #expect(await !rig.menu.relaunchIfIdle { Issue.record("relaunched before terminal save") })
                var finished = record; finished.phase = terminal
                try await owner.progress(finished)
                #expect(await rig.menu.relaunchIfIdle {})
                #expect(try await owner.load(call: id)?.phase == terminal)
                #expect(await http.count == 0)
                await rig.finish()
            } catch { await owner.release(job: job.id, call: id, input: job.input); await rig.finish(); throw error }
        }
    }
    @Test func automaticUpdateWaitsForDispatchedSummaryThenRelaunchesAfterCompletion() async throws {
        try await withComposeFolder { root in
            let http = ControlledHTTP(hold: true)
            let terminated = Values<Bool>()
            let rig = try await fixture(root: root, storage: ControlledTranscripts(), http: http, terminate: { terminated.append(true) })
            do {
                try await rig.start(); await rig.mine.heard.next(); await rig.theirs.heard.next()
                try await rig.stop(); await http.started.next()
                for await state in Observations({ rig.menu.state }) where state.phase == .idle { break }
                #expect(await !rig.menu.relaunchIfIdle { Issue.record("relaunched during summary generation") })
                #expect(terminated.all.isEmpty)
                #expect(await !http.cancelled)
                http.complete.send()
                _ = try await summary(rig.menu) { $0.values.contains("Итоги готовы") }
                #expect(await rig.menu.relaunchIfIdle {})
                #expect(terminated.all == [true])
                #expect(try await read(rig.folder().appendingPathComponent("summary.md")).contains("Synthetic meeting"))
                await rig.finish()
            } catch { http.complete.send(); await rig.finish(); throw error }
        }
    }
    @Test func quitDuringHeldFinalWritePersistsPendingBeforeTermination() async throws {
        try await withComposeFolder { root in
            let storage = ControlledTranscripts(holdFinal: true), http = ControlledHTTP(hold: false)
            let terminated = Signal()
            let rig = try await fixture(root: root, storage: storage, http: http, terminate: { terminated.send() })
            try await rig.start(); await rig.mine.heard.next(); await rig.theirs.heard.next()
            let quit = Task { await rig.menu.perform(.quit) }
            await storage.held.next()
            #expect(await http.count == 0)
            storage.release.send()
            await quit.value; await terminated.next()
            let text = try await read(rig.folder().appendingPathComponent(".summary-job.json"))
            #expect(text.contains("pending"))
            #expect(await http.count == 0)
            #expect(try await transcriptText(of: rig).contains("final"))
            await rig.finish()
        }
    }
}
@MainActor private func fixture(root: URL, storage: ControlledTranscripts, http: ControlledHTTP,
                               speakers: Bool = false,
                               terminate: @escaping @Sendable () async -> Void = {}) async throws -> ComposeFixture {
    let slot = NotesPreferences.Runtime(kind: "compatibleAPI", model: "fixture", executable: "", endpoint: "http://127.0.0.1/v1", credentialVariable: "")
    let preferences = Preferences(notes: .init(enabled: true, speakers: speakers, primary: slot, fallback: slot), automaticRecording: false, callsFolder: root)
    let runtime = Runtime(process: NoProcess(), http: http, credential: { _ in nil }, resolveProgram: { $0 }, deadline: { try await waitForCancellation() })
    return try await ComposeFixture.make(root: root, preferences: preferences, summaryRuntime: runtime,
                                         configure: { $0.transcripts = storage }, terminate: terminate)
}
@MainActor private func summary(_ menu: AudelinMenu, matching: ([String: String]) -> Bool) async throws -> [String: String] {
    for await state in menu.summaryStates() where matching(state) { return state }
    throw ScriptFailure.failed
}
private func read(_ url: URL) async throws -> String { try String(contentsOf: url, encoding: .utf8) }
private struct NoProcess: ProcessRunning {
    func run(program: String, arguments: [String], input: Data) throws -> ProcessOutput { throw Failure.unavailable }
}
private actor ControlledHTTP: HTTPRequesting {
    let hold: Bool
    nonisolated let started = Signal(), complete = Signal()
    var count = 0
    var cancelled = false
    let failures: Int
    var lastBody = ""
    init(hold: Bool, failures: Int = 0) { self.hold = hold; self.failures = failures }
    func request(url: URL, headers: [String: String], body: Data, loopback: Bool) async throws -> HTTPResponse {
        count += 1; started.send()
        lastBody = String(decoding: body, as: UTF8.self)
        if count <= failures { throw Failure.transport }
        if hold {
            do { await complete.next(); try Task.checkCancellation() }
            catch { cancelled = true; throw Failure.cancelled }
        }
        let notes = "## What this was about\n\nSynthetic meeting\n\n## Key points\n\n- mine final and theirs final\n\n## Decisions\n\nNone recorded.\n\n## Actions\n\nNone recorded.\n"
        return .init(status: 200, body: try JSONSerialization.data(withJSONObject: ["choices": [["finish_reason": "stop", "message": ["content": notes]]]]))
    }
}
private final class ControlledTranscripts: TranscriptStorage, Sendable {
    let holdFinal: Bool, failEarly: Bool, failFinal: Bool
    let held = Signal(), release = Signal(), written = Signal()
    init(holdFinal: Bool = false, failEarly: Bool = false, failFinal: Bool = false) {
        self.holdFinal = holdFinal; self.failEarly = failEarly; self.failFinal = failFinal
    }
    func open(at url: URL, sink: any LogSink) async throws -> any SessionTranscriptFile {
        ControlledTranscript(base: try await FileTranscriptStorage(diarizer: .unavailable).open(at: url, sink: sink), controls: self)
    }
}
private struct ControlledTranscript: SessionTranscriptFile {
    let base: any SessionTranscriptFile
    let controls: ControlledTranscripts
    func write(_ state: CallState) async throws {
        let final = state.status == .finished
        if final && controls.holdFinal { controls.held.send(); await controls.release.next() }
        if final ? controls.failFinal : controls.failEarly { throw ScriptFailure.failed }
        try await base.write(state)
        controls.written.send()
    }
    func replaceMicrophone(in state: CallState, with segments: [TranscriptSegment]) async throws {
        try await base.replaceMicrophone(in: state, with: segments)
    }

    func close() async { await base.close() }

    func attributeSpeakers() async -> AttributedFar? { await base.attributeSpeakers() }
}

private func waitForCancellation() async throws {
    let never = AsyncStream<Void> { _ in }
    for await _ in never {}
    try Task.checkCancellation()
}

private func notesText(_ detail: CallsDetail?) -> String? {
    if case let .notes(text, _) = detail?.content { text } else { nil }
}
