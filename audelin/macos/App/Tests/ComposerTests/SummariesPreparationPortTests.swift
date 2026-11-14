import Composer
import Preferences
import SummaryJobs
import Testing

@Suite struct SummariesPreparationPortTests {
    let primary = NotesPreferences.Runtime(kind: "cli", model: "m", executable: "/bin/p", endpoint: "e", credentialVariable: "K")
    let fallback = NotesPreferences.Runtime(kind: "api", model: "f", executable: "", endpoint: "https://x", credentialVariable: "F")

    @Test(arguments: [(true, false), (false, true), (true, true)])
    func aJobIsMadeWhenNotesAreOnOrAsked(enabled: Bool, requested: Bool) async {
        let job = await makeSUT(.init(enabled: enabled, speakers: true, primary: primary, fallback: fallback)).job(for: submission(requested: requested))
        #expect(job == Job(id: "id-1", call: "call", input: "input", entries: entries, speakers: true,
                           primary: .init(kind: "cli", model: "m", program: "/bin/p", endpoint: "e", credentialVariable: "K"),
                           fallback: .init(kind: "api", model: "f", program: "", endpoint: "https://x", credentialVariable: "F")))
    }
    @Test func noJobWhenNotesAreOffAndNotAsked() async {
        #expect(await makeSUT(.init(enabled: false)).job(for: submission(requested: false)) == nil)
    }
    @Test func aJobWithoutAFallbackHasNone() async {
        let job = await makeSUT(.init(enabled: true, speakers: false, primary: primary)).job(for: submission(requested: false))
        #expect(job?.fallback == nil && job?.speakers == false)
    }

    private let entries = [Job.Entry(label: "A", time: "0", text: "spoken")]
    private func submission(requested: Bool) -> SummariesSubmission {
        .init(call: "call", input: "input", entries: entries, finalWrite: true, usable: true, requested: requested)
    }
    private func makeSUT(_ notes: NotesPreferences) -> SummariesPreparationPort {
        .init(notes: { notes }, makeID: { "id-1" })
    }
}
