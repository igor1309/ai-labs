import Composer
import Foundation
import Preferences
import SummaryJobs
import Testing

@Suite struct SummariesPreparationPortTests {
    let primary = NotesPreferences.Runtime(kind: "cli", model: "m", executable: "/bin/p", endpoint: "e", credentialVariable: "K")
    let fallback = NotesPreferences.Runtime(kind: "api", model: "f", executable: "", endpoint: "https://x", credentialVariable: "F")

    @Test(arguments: [(true, false), (false, true), (true, true), (false, false)])
    func aJobIsMadeWithWhetherNotesAreOn(enabled: Bool, requested: Bool) async {
        let (job, notesOn) = await makeSUT(.init(enabled: enabled, speakers: true, primary: primary, fallback: fallback)).job(for: submission(requested: requested))
        #expect(notesOn == enabled)
                #expect(job == Job(id: "id-1", call: "call", input: job.input, entries: entries, speakers: true,
                           primary: .init(kind: "cli", model: "m", program: "/bin/p", endpoint: "e", credentialVariable: "K"),
                           fallback: .init(kind: "api", model: "f", program: "", endpoint: "https://x", credentialVariable: "F")))
    }
    @Test func aJobsInputIsKeyedByItsEntries() async {
        let sut = makeSUT(.init(enabled: true))
        let same = await sut.job(for: submission(requested: false)).job.input
        var other = submission(requested: false); other.entries = [.init(label: "B", time: "1", text: "other")]
        #expect(await sut.job(for: submission(requested: true)).job.input == same)
        #expect(await sut.job(for: other).job.input != same)
    }
    @Test func aJobWithoutAFallbackHasNone() async {
        let job = await makeSUT(.init(enabled: true, speakers: false, primary: primary)).job(for: submission(requested: false)).job
        #expect(job.fallback == nil && job.speakers == false)
    }

    @Test func aStoredCallsTranscriptBecomesARequestedSubmission() async throws {
        let sut = SummariesPreparationPort(notes: { .init(enabled: false) }, makeID: { "id-1" },
                                           callText: { _ in .init(notes: nil, transcript: [.init(start: 3, words: "spoken", label: "A")]) })
        let submission = try await sut.submission(call: "call")
        #expect(submission.call == "call" && submission.entries == [.init(label: "A", time: "3.0", text: "spoken")]
                && submission.finalWrite && submission.usable && submission.requested)
    }
    @Test func anEmptyTranscriptIsNotUsable() async throws {
        #expect(try await makeSUT(.init(enabled: true)).submission(call: "call").usable == false)
    }
    @Test func aFailedTranscriptReadThrows() async {
        let sut = SummariesPreparationPort(notes: { .init(enabled: true) }, makeID: { "id-1" }, callText: { _ in throw CocoaError(.fileReadNoSuchFile) })
        await #expect(throws: CocoaError.self) { try await sut.submission(call: "call") }
    }

    private let entries = [Job.Entry(label: "A", time: "0", text: "spoken")]
    private func submission(requested: Bool) -> SummariesSubmission {
        .init(call: "call", entries: entries, finalWrite: true, usable: true, requested: requested)
    }
    private func makeSUT(_ notes: NotesPreferences) -> SummariesPreparationPort {
        .init(notes: { notes }, makeID: { "id-1" }, callText: { _ in .init(notes: nil, transcript: []) })
    }
}
