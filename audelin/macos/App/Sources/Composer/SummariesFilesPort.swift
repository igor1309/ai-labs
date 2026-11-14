import Foundation
import SummaryFiles
import SummaryJobs

/// The summary files calls the Summaries machine's storage ports make.
public protocol SummariesFiles: Sendable {
    func claim(_ record: SummaryFiles.Record) async throws -> (owned: Bool, record: SummaryFiles.Record)
    func load(call: String) async throws -> SummaryFiles.Record?
    func retry(_ record: SummaryFiles.Record, job: String) async throws -> SummaryFiles.Record
    func start(_ record: SummaryFiles.Record) async throws -> Bool
    func progress(_ record: SummaryFiles.Record) async throws
    func publish(_ record: SummaryFiles.Record, notes: String) async throws
    func discard(_ record: SummaryFiles.Record) async throws
    func release(job: String, call: String, input: String) async
    func notes(call: String) async throws -> SummaryFiles.Notes?
}
extension SummaryFiles.Files: SummariesFiles {}

/// The Summaries machine's storage ports over the call's summary files.
public struct SummariesFilesPort: SummariesClaims, SummariesRecords, SummariesStarts, SummariesStorage {
    private let files: any SummariesFiles
    private let makeID: @Sendable () -> String
    public init(files: any SummariesFiles, makeID: @escaping @Sendable () -> String) { self.files = files; self.makeID = makeID }

    public func claim(_ job: Job) async throws -> (owned: Bool, saved: SummariesSaved) {
        let record = try Self.record(job, phase: "pending")
        var result = try await files.claim(record)
        // Notes deleted after they were made leave a finished record with nothing to show; a new job replaces it.
        if !result.owned, result.record.phase == "succeeded", try await files.notes(call: job.call) == nil {
            try await files.discard(result.record)
            result = try await files.claim(record)
        }
        return (result.owned, try Self.saved(result.record))
    }
    public func load(call: String) async throws -> SummariesSaved? {
        try await files.load(call: call).map(Self.saved)
    }
    public func retry(_ job: Job) async throws -> SummariesSaved {
        guard let record = try await files.load(call: job.call), record.job == job.id else { throw CocoaError(.fileReadNoSuchFile) }
        return try Self.saved(try await files.retry(record, job: makeID()))
    }

    public func start(_ job: Job) async throws -> Bool { try await files.start(try Self.record(job, phase: "running")) }
    public func checkpoint(_ job: Job, identities: [Identity], warning: Bool) async throws {
        var value = try Self.record(job, phase: "running", warning: warning)
        value.checkpoint = try JSONSerialization.data(withJSONObject: identities.map { ["label": $0.label, "name": $0.name, "time": $0.time, "quote": $0.quote] })
        try await files.progress(value)
    }
    public func publish(_ job: Job, notes: String, warning: Bool) async throws {
        try await files.publish(try Self.record(job, phase: "running", warning: warning), notes: notes)
    }
    /// Saves the job's last stage; only a succeeded or failed job is saved.
    public func save(_ job: Job, stage: SummariesState.Call.Stage, warning: Bool) async throws {
        guard stage == .succeeded || stage == .failed else { throw CocoaError(.fileWriteUnknown) }
        try await files.progress(try Self.record(job, phase: stage == .succeeded ? "succeeded" : "failed", warning: warning))
    }
    public func discard(_ job: Job) async throws { try await files.discard(try Self.record(job, phase: "running")) }
    public func release(_ job: Job) async { await files.release(job: job.id, call: job.call, input: job.input) }

    /// Sorted keys keep a job's snapshot the same bytes on every write.
    private static let encoder: JSONEncoder = { let encoder = JSONEncoder(); encoder.outputFormatting = .sortedKeys; return encoder }()
    static func record(_ job: Job, phase: String, warning: Bool = false) throws -> SummaryFiles.Record {
        .init(job: job.id, call: job.call, input: job.input, snapshot: try encoder.encode(Snapshot(job)), phase: phase, warning: warning)
    }
    /// A stored record as the machine holds it; a job another process runs is observed.
    static func saved(_ record: SummaryFiles.Record) throws -> SummariesSaved {
        let snapshot = try JSONDecoder().decode(Snapshot.self, from: record.snapshot)
        let job = Job(id: record.job, call: record.call, input: record.input, entries: snapshot.entries.map(\.value),
                      speakers: snapshot.speakers, primary: snapshot.primary.value, fallback: snapshot.fallback?.value)
        let stages: [String: SummariesState.Call.Stage] = ["pending": .pending, "running": .observed, "interrupted": .interrupted,
                                                           "succeeded": .succeeded, "failed": .failed]
        guard let stage = stages[record.phase] else { throw CocoaError(.fileReadCorruptFile) }
        return .init(stage: stage, job: job, warning: record.warning)
    }
}
