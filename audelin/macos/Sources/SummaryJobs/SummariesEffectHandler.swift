/// Turns a submission into a job from the notes preferences.
public protocol SummariesPreparation: Sendable {
    /// The job for the submission, or none when notes are off and the user did not ask for them.
    func job(for submission: SummariesSubmission) async -> Job?
}

/// Takes a job into storage, or finds the one already there.
public protocol SummariesClaims: Sendable {
    func claim(_ job: Job) async throws -> (owned: Bool, saved: SummariesSaved)
}

/// Hands each effect to its collaborator and answers with the event its result means; it keeps nothing.
public struct SummariesEffectHandler: Sendable {
    private let preparation: any SummariesPreparation
    private let claims: any SummariesClaims
    public init(preparation: any SummariesPreparation, claims: any SummariesClaims) {
        self.preparation = preparation; self.claims = claims
    }
    public func handle(_ effect: SummariesEffect) async -> SummariesEvent {
        switch effect {
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
