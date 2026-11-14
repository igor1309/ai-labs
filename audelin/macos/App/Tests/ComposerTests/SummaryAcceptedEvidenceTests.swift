import CallsStorage
import Foundation
import SummaryFiles
import SummaryJobs
import Testing
@testable import Composer

@Suite(.timeLimit(.minutes(1)))
struct SummaryAcceptedEvidenceTests {
    @Test func rootCheckpointSerializesEveryAcceptedEvidenceFieldAndRetainsItOnFailure() async throws {
        try await withComposeFolder { root in
            let job = evidenceJob(), identities = acceptedIdentities()
            let folder = root.appendingPathComponent(job.call)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let files = Files(locations: callsStorage(folder: root, timeZone: .gmt, trash: removeForTrash), disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let store = SummariesFilesPort(files: files, makeID: { "fresh" })
            #expect(try await store.claim(job).owned)
            #expect(try await store.start(job))
            try await store.checkpoint(job, identities: identities, warning: false)
            let checkpoint = try await persistedEvidence(folder)
            #expect(checkpoint == identities)
            try await store.save(job, stage: .failed, warning: false)
            #expect(try await persistedEvidence(folder) == identities)
            let record = try #require(try await files.load(call: job.call))
            #expect(record.phase == "failed" && !record.warning)
        }
    }
}
private func persistedEvidence(_ folder: URL) async throws -> [Identity] {
    let record = try JSONDecoder().decode(Record.self, from: Data(contentsOf: folder.appendingPathComponent(".summary-job.json")))
    let data = try #require(record.checkpoint)
    let values = try JSONDecoder().decode([StoredEvidence].self, from: data)
    return values.map { .init(label: $0.label, name: $0.name, time: $0.time, quote: $0.quote) }
}
private struct StoredEvidence: Decodable { let label: String; let name: String; let time: String; let quote: String }
private func acceptedIdentities() -> [Identity] {
    [.init(label: "A", name: "Анна", time: "00:17", quote: "Меня зовут Анна."),
     .init(label: "B", name: "José", time: "01:03", quote: "Soy José.")]
}
private func evidenceJob() -> Job {
    let slot = Job.Runtime(kind: "compatibleAPI", model: "evidence-model", program: "", endpoint: "http://127.0.0.1/v1", credentialVariable: "")
    return .init(id: "accepted-job", call: "1970.01.01-0000", input: "accepted-input", entries: acceptedIdentities().map { .init(label: $0.label, time: $0.time, text: $0.quote) }, speakers: true, primary: slot, fallback: slot)
}
