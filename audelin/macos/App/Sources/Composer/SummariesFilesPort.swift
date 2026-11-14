import Foundation
import SummaryFiles
import SummaryJobs

/// The summary files calls the Summaries machine's storage ports make.
public protocol SummariesFiles: Sendable {
    func claim(_ record: SummaryFiles.Record) async throws -> (owned: Bool, record: SummaryFiles.Record)
    func load(call: String) async throws -> SummaryFiles.Record?
    func retry(_ record: SummaryFiles.Record, job: String) async throws -> SummaryFiles.Record
}
extension SummaryFiles.Files: SummariesFiles {}

/// The Summaries machine's storage ports over the call's summary files.
public struct SummariesFilesPort: SummariesClaims, SummariesRecords {
    private let files: any SummariesFiles
    private let makeID: @Sendable () -> String
    public init(files: any SummariesFiles, makeID: @escaping @Sendable () -> String) { self.files = files; self.makeID = makeID }

    public func claim(_ job: Job) async throws -> (owned: Bool, saved: SummariesSaved) {
        let result = try await files.claim(try Self.record(job, phase: "pending"))
        return (result.owned, try Self.saved(result.record))
    }
    public func load(call: String) async throws -> SummariesSaved? {
        try await files.load(call: call).map(Self.saved)
    }
    public func retry(_ job: Job) async throws -> SummariesSaved {
        guard let record = try await files.load(call: job.call), record.job == job.id else { throw CocoaError(.fileReadNoSuchFile) }
        return try Self.saved(try await files.retry(record, job: makeID()))
    }

    static func record(_ job: Job, phase: String, warning: Bool = false) throws -> SummaryFiles.Record {
        .init(job: job.id, call: job.call, input: job.input, snapshot: try JSONEncoder().encode(Snapshot(job)), phase: phase, warning: warning)
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
