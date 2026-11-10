import Calls
import Foundation

struct TransactionalTranscriptStorage: TranscriptStorage {
    let base: any TranscriptStorage
    let storage: SummaryStorage
    let timeZone: TimeZone
    func open(at url: URL, sink: any LogSink) async throws -> any SessionTranscriptFile {
        guard let id = Calls.id(in: url.deletingLastPathComponent().lastPathComponent, timeZone: timeZone) else {
            throw CocoaError(.fileWriteInvalidFileName)
        }
        return TransactionalTranscript(base: try await base.open(at: url, sink: sink), storage: storage, call: id)
    }
}

private struct TransactionalTranscript: SessionTranscriptFile {
    let base: any SessionTranscriptFile
    let storage: SummaryStorage
    let call: String
    func write(_ state: CallState) async throws { try await base.write(state) }
    func close() async { await base.close() }
    func replaceMicrophone(in state: CallState, with segments: [TranscriptSegment], at destination: URL?) async throws {
        try await storage.withTranscriptFolder(call: call) { folder in
            try await base.replaceMicrophone(in: state, with: segments, at: folder.appendingPathComponent("transcript.md"))
        }
    }
}
