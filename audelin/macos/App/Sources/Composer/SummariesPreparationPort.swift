import Preferences
import SummaryJobs

/// Turns a submission into a job from the notes preferences read at that moment.
public struct SummariesPreparationPort: SummariesPreparation {
    private let notes: @Sendable () -> NotesPreferences
    private let makeID: @Sendable () -> String
    public init(notes: @escaping @Sendable () -> NotesPreferences, makeID: @escaping @Sendable () -> String) {
        self.notes = notes; self.makeID = makeID
    }
    public func job(for submission: SummariesSubmission) async -> Job? {
        let config = notes()
        guard config.enabled || submission.requested else { return nil }
        func runtime(_ value: NotesPreferences.Runtime) -> Job.Runtime {
            .init(kind: value.kind, model: value.model, program: value.executable, endpoint: value.endpoint, credentialVariable: value.credentialVariable)
        }
        return Job(id: makeID(), call: submission.call, input: submission.input, entries: submission.entries,
                   speakers: config.speakers, primary: runtime(config.primary), fallback: config.fallback.map(runtime))
    }
}
