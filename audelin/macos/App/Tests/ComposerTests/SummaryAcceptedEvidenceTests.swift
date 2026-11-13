import BlockingTestWork
import Foundation
import SummaryFiles
import SummaryJobs
import Testing
@testable import Composer

@Suite(.timeLimit(.minutes(1)))
struct SummaryAcceptedEvidenceTests {
    @Test(arguments: [false, true])
    func acceptedIdentitiesReachCheckpointAndNotesAndSurviveNotesFailure(notesFail: Bool) async throws {
        let job = evidenceJob(), identities = acceptedIdentities()
        let trace = EvidenceTrace(), store = EvidenceStore(trace: trace)
        let handler = EffectHandler(store: store, generation: EvidenceGeneration(trace: trace, identities: identities, fails: notesFail), userCancelled: { _ in false })
        let reducer = Reducer(format: { phase, _ in phase.rawValue })
        let given = SummaryJobs.State(phase: .identifying, job: job)
        let identified = await handler.handle(.identify(job))
        #expect(identified == .identified(identities))
        let (checkpointing, checkpoint) = reducer.reduce(given, identified)
        var expected = given
        expected.phase = .checkpointing; expected.identities = identities; expected.status = "checkpointing"
        #expect(checkpointing == expected)
        #expect(checkpoint == .checkpoint(job, identities, warning: false))
        let checkpointed = await handler.handle(try #require(checkpoint))
        #expect(checkpointed == .checkpointed)
        let (noting, notes) = reducer.reduce(checkpointing, checkpointed)
        expected.phase = .noting; expected.status = "noting"
        #expect(noting == expected)
        #expect(notes == .notes(job, identities))
        let result = await handler.handle(try #require(notes))
        #expect(result == (notesFail ? .notesFailed : .noted("notes with accepted names")))
        let (finished, effect) = reducer.reduce(noting, result)
        expected.phase = notesFail ? .saving : .publishing
        expected.status = expected.phase.rawValue
        expected.terminal = notesFail ? .failed : nil
        expected.notes = notesFail ? nil : "notes with accepted names"
        #expect(finished == expected)
        #expect(effect == (notesFail ? .save(job, .failed, warning: false) : .publish(job, "notes with accepted names", warning: false)))
        #expect(await handler.handle(try #require(effect)) == (notesFail ? .saved : .published))
        #expect(await trace.calls == [
            .identify(job), .checkpoint(job, identities, false), .notes(job, identities),
            notesFail ? .save(job, .failed, false) : .publish(job, "notes with accepted names", false)
        ])
    }

    @Test func rootCheckpointSerializesEveryAcceptedEvidenceFieldAndRetainsItOnFailure() async throws {
        try await withComposeFolder { root in
            let job = evidenceJob(), identities = acceptedIdentities()
            let folder = root.appendingPathComponent(job.call)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let files = Files(locations: SummaryStorage(folder: root, timeZone: .gmt, trash: removeForTrash), disk: FileDisk(), ownershipDirectory: root.appendingPathComponent("leases"))
            let store = SummaryJobStore(files: files)
            #expect(try await store.claim(job).owned)
            #expect(try await store.start(job))
            try await store.checkpoint(job, identities: identities, warning: false)
            let checkpoint = try await persistedEvidence(folder)
            #expect(checkpoint == identities)
            try await store.save(job, phase: .failed, warning: false)
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
private actor EvidenceTrace {
    enum Call: Equatable {
        case identify(Job), checkpoint(Job, [Identity], Bool), notes(Job, [Identity])
        case publish(Job, String, Bool), save(Job, SummaryJobs.State.Phase, Bool)
    }
    var calls: [Call] = []
    func append(_ call: Call) { calls.append(call) }
}
private struct EvidenceStore: Store {
    let trace: EvidenceTrace
    func claim(_ job: Job) throws -> (owned: Bool, state: SummaryJobs.State) { Issue.record("unexpected claim"); throw ScriptFailure.failed }
    func release(_ job: Job) async {}
    func start(_ job: Job) throws -> Bool { Issue.record("unexpected start"); throw ScriptFailure.failed }
    func checkpoint(_ job: Job, identities: [Identity], warning: Bool) async { await trace.append(.checkpoint(job, identities, warning)) }
    func publish(_ job: Job, notes: String, warning: Bool) async { await trace.append(.publish(job, notes, warning)) }
    func save(_ job: Job, phase: SummaryJobs.State.Phase, warning: Bool) async { await trace.append(.save(job, phase, warning)) }
    func discard(_ job: Job) async {}
}
private struct EvidenceGeneration: Generation {
    let trace: EvidenceTrace
    let identities: [Identity]
    let fails: Bool
    func identify(_ job: Job) async -> [Identity] { await trace.append(.identify(job)); return identities }
    func notes(_ job: Job, identities: [Identity]) async throws -> String {
        await trace.append(.notes(job, identities))
        if fails { throw ScriptFailure.failed }
        return "notes with accepted names"
    }
}
