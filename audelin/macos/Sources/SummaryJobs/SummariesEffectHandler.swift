/// Turns a submission into a job from the notes preferences.
public protocol SummariesPreparation: Sendable {
    /// The job for the submission, or none when notes are off and the user did not ask for them.
    func job(for submission: SummariesSubmission) async -> Job?
}

/// Takes a job into storage, or finds the one already there.
public protocol SummariesClaims: Sendable {
    func claim(_ job: Job) async throws -> (owned: Bool, saved: SummariesSaved)
}

/// Reads a call's saved job.
public protocol SummariesRecords: Sendable {
    /// The call's saved job, or none when storage holds no job for it.
    func load(call: String) async throws -> SummariesSaved?
}

/// Hands each effect to its collaborator and answers with the event its result means; it keeps nothing.
public struct SummariesEffectHandler: Sendable {
    private let preparation: any SummariesPreparation
    private let claims: any SummariesClaims
    private let records: any SummariesRecords
    public init(preparation: any SummariesPreparation, claims: any SummariesClaims, records: any SummariesRecords) {
        self.preparation = preparation; self.claims = claims; self.records = records
    }
    public func handle(_ effect: SummariesEffect) async -> SummariesEvent {
        switch effect {
        case let .load(call):
            do { return .recovered(call, try await records.load(call: call)) }
            catch { return .loadFailed(call) }
        case let .prepare(submission):
            return .prepared(submission.call, await preparation.job(for: submission))
        case let .claim(job):
            do {
                let result = try await claims.claim(job)
                return .claimed(job.call, owned: result.owned, result.saved)
            } catch { return .storageFailed(job.call) }
        }
    }
}
