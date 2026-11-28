import Calls
import Preferences
import SummaryJobs

/// Turns a submission into a job, with whether notes are on, from the notes preferences read at that moment, and a stored call's transcript
/// into a submission.
public struct SummariesPreparationPort: SummariesPreparation {
    private let notes: @Sendable () -> NotesPreferences
    private let makeID: @Sendable () -> String
    private let callText: @Sendable (String) async throws -> Calls.Text
    public init(notes: @escaping @Sendable () -> NotesPreferences, makeID: @escaping @Sendable () -> String,
                callText: @escaping @Sendable (String) async throws -> Calls.Text) {
        self.notes = notes; self.makeID = makeID; self.callText = callText
    }
    public func submission(call: String) async throws -> SummariesSubmission {
        let text = try await callText(call)
        let entries = storedSummaryEntries(text.transcript)
        return .init(call: call, entries: entries, finalWrite: true, usable: !entries.isEmpty, requested: true, transcriptIdentity: text.identity)
    }
    public func input(call: String) async throws -> String {
        summaryInput(try await submission(call: call).entries)
    }
    public func job(for submission: SummariesSubmission) async -> (job: Job, notesOn: Bool) {
        let config = notes()
        return (summaryJob(for: submission, config: config, id: makeID()), config.enabled)
    }
}

func summaryJob(for submission: SummariesSubmission, config: NotesPreferences, id: String) -> Job {
    func runtime(_ value: NotesPreferences.Runtime) -> Job.Runtime {
        .init(kind: value.kind, model: value.model, program: value.executable, endpoint: value.endpoint, credentialVariable: value.credentialVariable)
    }
    return Job(id: id, call: submission.call, input: summaryInput(submission.entries), entries: submission.entries,
                  speakers: config.speakers, primary: runtime(config.primary), fallback: config.fallback.map(runtime), transcriptIdentity: submission.transcriptIdentity)
}
