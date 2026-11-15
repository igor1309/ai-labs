import Composer
import Foundation
import Synchronization
import SummaryFiles
import SummaryJobs
import Testing

@Suite struct SummariesFilesPortTests {
    let job = Job(id: "job", call: "call", input: "input", entries: [.init(label: "A", time: "0", text: "spoken")], speakers: true,
                  primary: .init(kind: "cli", model: "m", program: "p", endpoint: "", credentialVariable: ""))

    @Test func claimWritesThePendingJob() async throws {
        let files = FilesFake()
        _ = try await makeSUT(files).claim(job)
        let written = try #require(files.claimed.first)
        #expect(files.claimed.count == 1 && written.job == "job" && written.call == "call" && written.phase == "pending")
    }
    @Test(arguments: [true, false]) func claimAnswersWhatStorageHolds(owned: Bool) async throws {
        let files = FilesFake(); files.claimAnswer = { (owned, $0) }
        let result = try await makeSUT(files).claim(job)
        #expect(result.owned == owned && result.saved == .init(stage: .pending, job: job))
    }
    @Test func aClaimReplacesAFinishedRecordWhoseNotesWereDeleted() async throws {
        let files = FilesFake(), finished = try await record(phase: "succeeded")
        files.claimAnswer = { [files] new in files.writes.isEmpty ? (false, finished) : (true, new) }
        let result = try await makeSUT(files).claim(job)
        #expect(files.writes == [.discard(finished)] && result.owned && result.saved == .init(stage: .pending, job: job))
    }
    @Test func aClaimKeepsAFinishedRecordWithItsNotes() async throws {
        let files = FilesFake(), finished = try await record(phase: "succeeded")
        files.storedNotes = .init(text: "notes", made: .distantPast)
        files.claimAnswer = { _ in (false, finished) }
        let result = try await makeSUT(files).claim(job)
        #expect(files.writes.isEmpty && !result.owned && result.saved.stage == .succeeded)
    }
    @Test func aFailedClaimThrows() async {
        let files = FilesFake(); files.claimAnswer = { _ in throw CocoaError(.fileWriteUnknown) }
        await #expect(throws: (any Error).self) { try await makeSUT(files).claim(job) }
    }

    @Test(arguments: [("pending", SummariesState.Call.Stage.pending), ("running", .observed), ("interrupted", .interrupted),
                      ("succeeded", .succeeded), ("failed", .failed)])
    func loadMapsEachStoredPhase(phase: String, stage: SummariesState.Call.Stage) async throws {
        let files = FilesFake(); files.stored = try await record(phase: phase, warning: true)
        #expect(try await makeSUT(files).load(call: "call") == .init(stage: stage, job: job, warning: true))
        #expect(files.loaded == ["call"])
    }
    @Test func loadOfACallWithoutAJobIsNone() async throws {
        #expect(try await makeSUT(FilesFake()).load(call: "call") == nil)
    }
    @Test func loadOfAnUnknownPhaseThrows() async throws {
        let files = FilesFake(); files.stored = try await record(phase: "starting")
        await #expect(throws: (any Error).self) { try await makeSUT(files).load(call: "call") }
    }

    @Test func retryReplacesTheStoredAttemptUnderAFreshID() async throws {
        let files = FilesFake(); files.stored = try await record(phase: "failed")
        let saved = try await makeSUT(files).retry(job)
        var fresh = job; fresh.id = "fresh"
        #expect(files.retried.map(\.1) == ["fresh"] && saved == .init(stage: .pending, job: fresh))
    }
    @Test func retryOfAJobStorageNeverHeldClaimsItUnderAFreshID() async throws {
        let files = FilesFake()
        let saved = try await makeSUT(files).retry(job)
        var fresh = job; fresh.id = "fresh"
        #expect(files.claimed.map(\.job) == ["fresh"] && files.retried.isEmpty && saved == .init(stage: .pending, job: fresh))
    }
    @Test func retryThatFindsAnotherJobClaimedMeanwhileThrows() async {
        let files = FilesFake(); files.claimAnswer = { (false, $0) }
        await #expect(throws: (any Error).self) { try await makeSUT(files).retry(job) }
    }
    @Test func retryOfAnAttemptStorageNoLongerHoldsThrows() async throws {
        let files = FilesFake(); var other = try await record(phase: "failed"); other.job = "other"; files.stored = other
        await #expect(throws: (any Error).self) { try await makeSUT(files).retry(job) }
        #expect(files.retried.isEmpty)
    }

    @Test func startWritesTheRunningJob() async throws {
        let files = FilesFake()
        #expect(try await makeSUT(files).start(job))
        #expect(files.writes == [.start(try await record(phase: "running"))])
    }
    @Test func checkpointWritesTheIdentitiesAndWarning() async throws {
        let files = FilesFake()
        try await makeSUT(files).checkpoint(job, identities: [.init(label: "A", name: "Ann", time: "0", quote: "hi")], warning: true)
        guard case let .progress(written) = try #require(files.writes.first) else { Issue.record("not a progress write"); return }
        let names = try JSONSerialization.jsonObject(with: try #require(written.checkpoint)) as? [[String: String]]
        #expect(written.phase == "running" && written.warning && names == [["label": "A", "name": "Ann", "time": "0", "quote": "hi"]])
    }
    @Test func publishWritesTheNotes() async throws {
        let files = FilesFake()
        try await makeSUT(files).publish(job, notes: "notes", warning: true, keeping: .rotation)
        #expect(files.writes == [.publish(try await record(phase: "running", warning: true), "notes", .default, .rotation)])
    }
    @Test(arguments: [(SummariesState.Call.Stage.succeeded, "succeeded"), (.failed, "failed")])
    func saveWritesTheLastStage(stage: SummariesState.Call.Stage, phase: String) async throws {
        let files = FilesFake()
        try await makeSUT(files).save(job, stage: stage, warning: true)
        #expect(files.writes == [.progress(try await record(phase: phase, warning: true))])
    }
    @Test func saveOfAStageThatIsNotLastThrowsWithoutWriting() async {
        let files = FilesFake()
        await #expect(throws: (any Error).self) { try await makeSUT(files).save(job, stage: .noting, warning: false) }
        #expect(files.writes.isEmpty)
    }
    @Test func discardRemovesTheJob() async throws {
        let files = FilesFake()
        try await makeSUT(files).discard(job)
        #expect(files.writes == [.discard(try await record(phase: "running"))])
    }
    @Test func releaseFreesTheJobsLease() async {
        let files = FilesFake()
        await makeSUT(files).release(job)
        #expect(files.writes == [.release(job: "job", call: "call", input: "input")])
    }
    @Test func aFailedWriteThrows() async {
        let sut = makeSUT(FilesFake(fails: true))
        await #expect(throws: (any Error).self) { try await sut.start(job) }
        await #expect(throws: (any Error).self) { try await sut.publish(job, notes: "n", warning: false, keeping: .rotation) }
        await #expect(throws: (any Error).self) { try await sut.discard(job) }
    }

    @Test(arguments: [true, false])
    func capturedTemplateAndKeepingSurviveStorageAndDrivePublication(keeping: Bool) async throws {
        let files = FilesFake(), sut = makeSUT(files)
        var chosen = job
        chosen.template = .init(name: "Daily", instructions: "saved instructions", headings: [[.init(name: "Day", required: false)]])
        chosen.keepPrevious = keeping; chosen.requested = true
        let saved = try await sut.claim(chosen).saved
        files.stored = try #require(files.claimed.first)
        #expect(try await sut.load(call: "call") == saved && saved.job == chosen)
        try await sut.publish(saved.job, notes: "daily notes", warning: false, keeping: keeping ? .rotation : .replacement)
        guard case let .publish(record, text, template, policy) = try #require(files.writes.last) else {
            Issue.record("missing publication"); return
        }
        #expect(record.job == chosen.id && text == "daily notes")
        #expect(template == Attribution(id: "Daily", name: "Daily"))
        #expect(policy == (keeping ? .rotation : .replacement))
    }

    @Test func oldSnapshotsReadWithDefaultKeepingAndNoResolvedTemplate() async throws {
        let files = FilesFake()
        var old = try await record(phase: "pending")
        var snapshot = try #require(try JSONSerialization.jsonObject(with: old.snapshot) as? [String: Any])
        for key in ["template", "keepPrevious", "requested"] { snapshot[key] = nil }
        old.snapshot = try JSONSerialization.data(withJSONObject: snapshot)
        files.stored = old
        #expect(try await makeSUT(files).load(call: "call")?.job == job)
    }

    @Test(arguments: ["succeeded", "failed", "interrupted"])
    func anExplicitNewRunReplacesTheSettledAttempt(phase: String) async throws {
        let files = FilesFake(), old = try await record(phase: phase)
        files.claimAnswer = { _ in (false, old) }
        var chosen = job; chosen.id = "new"; chosen.requested = true
        let saved = try await makeSUT(files).claim(chosen)
        #expect(saved.owned && saved.saved.job == chosen && saved.saved.stage == .pending)
        #expect(files.writes == [.replaceAttempt(old, try #require(files.stored))])
    }

    @Test func aNewRunDoesNotReplaceAnActiveAttempt() async throws {
        let files = FilesFake(), active = try await record(phase: "running")
        files.claimAnswer = { _ in (false, active) }
        var chosen = job; chosen.id = "new"; chosen.requested = true
        let saved = try await makeSUT(files).claim(chosen)
        #expect(!saved.owned && saved.saved.job == job && saved.saved.stage == .observed)
        #expect(files.writes.isEmpty)
    }

    /// A stored record of the job as the port writes it, in the given phase.
    private func record(phase: String, warning: Bool = false) async throws -> SummaryFiles.Record {
        let files = FilesFake()
        _ = try await makeSUT(files).claim(job)
        var value = try #require(files.claimed.first); value.phase = phase; value.warning = warning; return value
    }
    private func makeSUT(_ files: FilesFake) -> SummariesFilesPort { .init(files: files, makeID: { "fresh" }) }
}

/// Answers the port's file calls from a stored record and records each call.
final class FilesFake: SummariesFiles {
    enum Write: Equatable { case replaceAttempt(SummaryFiles.Record, SummaryFiles.Record)
        case start(SummaryFiles.Record), progress(SummaryFiles.Record), publish(SummaryFiles.Record, String, Attribution, Keeping),
                            discard(SummaryFiles.Record), release(job: String, call: String, input: String) }
    private struct Calls {
        var claimed: [SummaryFiles.Record] = []; var loaded: [String] = []; var retried: [(SummaryFiles.Record, String)] = []
        var writes: [Write] = []
    }
    private let calls = Mutex(Calls())
    private let answers = Mutex<(stored: SummaryFiles.Record?, claim: @Sendable (SummaryFiles.Record) throws -> (Bool, SummaryFiles.Record))>(
        (nil, { (true, $0) }))
    var stored: SummaryFiles.Record? {
        get { answers.withLock { $0.stored } }
        set { answers.withLock { $0.stored = newValue } }
    }
    var claimAnswer: @Sendable (SummaryFiles.Record) throws -> (Bool, SummaryFiles.Record) {
        get { answers.withLock { $0.claim } }
        set { answers.withLock { $0.claim = newValue } }
    }
    var claimed: [SummaryFiles.Record] { calls.withLock { $0.claimed } }
    var loaded: [String] { calls.withLock { $0.loaded } }
    var retried: [(SummaryFiles.Record, String)] { calls.withLock { $0.retried } }
    var writes: [Write] { calls.withLock { $0.writes } }
    let fails: Bool
    init(fails: Bool = false) { self.fails = fails }
    private let notesAnswer = Mutex<SummaryFiles.Notes?>(nil)
    var storedNotes: SummaryFiles.Notes? {
        get { notesAnswer.withLock { $0 } }
        set { notesAnswer.withLock { $0 = newValue } }
    }
    func notes(call: String) async throws -> SummaryFiles.Notes? { storedNotes }
    func start(_ record: SummaryFiles.Record) async throws -> Bool { try write(.start(record)); return true }
    func progress(_ record: SummaryFiles.Record) async throws { try write(.progress(record)) }
    func publish(_ record: SummaryFiles.Record, notes: String, template: Attribution, keeping: Keeping) async throws { try write(.publish(record, notes, template, keeping)) }
    func discard(_ record: SummaryFiles.Record) async throws { try write(.discard(record)) }
    func release(job: String, call: String, input: String) async { calls.withLock { $0.writes.append(.release(job: job, call: call, input: input)) } }
    private func write(_ value: Write) throws {
        calls.withLock { $0.writes.append(value) }
        if fails { throw CocoaError(.fileWriteUnknown) }
    }
    func claim(_ record: SummaryFiles.Record) async throws -> (owned: Bool, record: SummaryFiles.Record) {
        calls.withLock { $0.claimed.append(record) }
        let (owned, value) = try claimAnswer(record); return (owned, value)
    }
    func replaceAttempt(_ record: SummaryFiles.Record, with next: SummaryFiles.Record) async throws -> SummaryFiles.Record {
        try write(.replaceAttempt(record, next))
        stored = next
        return next
    }
    func load(call: String) async throws -> SummaryFiles.Record? { calls.withLock { $0.loaded.append(call) }; return stored }
    func retry(_ record: SummaryFiles.Record, job: String) async throws -> SummaryFiles.Record {
        calls.withLock { $0.retried.append((record, job)) }
        var value = record; value.job = job; value.phase = "pending"; return value
    }
}
