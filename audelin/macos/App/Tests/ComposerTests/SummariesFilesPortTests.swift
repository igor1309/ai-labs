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
    @Test func retryOfAnAttemptStorageNoLongerHoldsThrows() async throws {
        let files = FilesFake(); var other = try await record(phase: "failed"); other.job = "other"; files.stored = other
        await #expect(throws: (any Error).self) { try await makeSUT(files).retry(job) }
        #expect(files.retried.isEmpty)
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
    private struct Calls { var claimed: [SummaryFiles.Record] = []; var loaded: [String] = []; var retried: [(SummaryFiles.Record, String)] = [] }
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
    func claim(_ record: SummaryFiles.Record) async throws -> (owned: Bool, record: SummaryFiles.Record) {
        calls.withLock { $0.claimed.append(record) }
        let (owned, value) = try claimAnswer(record); return (owned, value)
    }
    func load(call: String) async throws -> SummaryFiles.Record? { calls.withLock { $0.loaded.append(call) }; return stored }
    func retry(_ record: SummaryFiles.Record, job: String) async throws -> SummaryFiles.Record {
        calls.withLock { $0.retried.append((record, job)) }
        var value = record; value.job = job; value.phase = "pending"; return value
    }
}
