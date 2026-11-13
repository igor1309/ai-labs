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
    /// Saves the job anew under a fresh id, ready to run again.
    func retry(_ job: Job) async throws -> SummariesSaved
}

/// Starts a pending job in storage.
public protocol SummariesStarts: Sendable {
    /// Whether this process now runs the job; false when another process already does.
    func start(_ job: Job) async throws -> Bool
}

/// Writes a running job's progress to storage.
public protocol SummariesStorage: Sendable {
    func checkpoint(_ job: Job, identities: [Identity], warning: Bool) async throws
    func publish(_ job: Job, notes: String, warning: Bool) async throws
    func save(_ job: Job, stage: SummariesState.Call.Stage, warning: Bool) async throws
    /// Removes the job's record and releases this process's lease on it.
    func discard(_ job: Job) async throws
    /// Releases this process's lease on the job.
    func release(_ job: Job) async
}

/// Makes a job's speaker names and notes; each answer is already validated.
public protocol SummariesGeneration: Sendable {
    func identify(_ job: Job) async throws -> [Identity]
    func notes(_ job: Job, identities: [Identity]) async throws -> String
}

/// Hands each effect to its collaborator and answers with the event its result means; it keeps nothing.
public struct SummariesEffectHandler: Sendable {
    private let preparation: any SummariesPreparation
    private let claims: any SummariesClaims
    private let records: any SummariesRecords
    private let starts: any SummariesStarts
    private let storage: any SummariesStorage
    private let generation: any SummariesGeneration
    public init(preparation: any SummariesPreparation, claims: any SummariesClaims, records: any SummariesRecords,
                starts: any SummariesStarts, storage: any SummariesStorage, generation: any SummariesGeneration) {
        self.preparation = preparation; self.claims = claims; self.records = records; self.starts = starts
        self.storage = storage; self.generation = generation
    }
    public func handle(_ effect: SummariesEffect) async -> SummariesEvent {
        switch effect {
        case let .start(job):
            do { return .started(job.call, owned: try await starts.start(job)) }
            catch { await storage.release(job); return .storageFailed(job.call) }
        case let .identify(job):
            do { return .identified(job.call, try await generation.identify(job)) }
            catch { return .identificationFailed(job.call) }
        case let .notes(job, identities):
            do { return .noted(job.call, try await generation.notes(job, identities: identities)) }
            catch { return .notesFailed(job.call) }
        case let .checkpoint(job, identities, warning):
            return await stored(job, .checkpointed(job.call)) { try await storage.checkpoint(job, identities: identities, warning: warning) }
        case let .publish(job, notes, warning):
            return await stored(job, .published(job.call)) { try await storage.publish(job, notes: notes, warning: warning) }
        case let .save(job, stage, warning):
            let event = await stored(job, .saved(job.call)) { try await storage.save(job, stage: stage, warning: warning) }
            if event == .saved(job.call) { await storage.release(job) }
            return event
        case let .discard(job):
            return await stored(job, .discarded(job.call)) { try await storage.discard(job) }
        case let .release(jobs):
            for job in jobs { await storage.release(job) }
            return .released
        case let .reload(calls):
            var results: [String: SummariesSaved?] = [:]
            for call in calls {
                do { results[call] = .some(try await records.load(call: call)) } catch {}
            }
            return .reloaded(results)
        case let .retry(job):
            do { return .retried(job.call, try await records.retry(job)) }
            catch { return .retryFailed(job.call) }
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
    /// Answers `done` after the write, or releases the job and answers a storage failure.
    private func stored(_ job: Job, _ done: SummariesEvent, _ write: () async throws -> Void) async -> SummariesEvent {
        do { try await write(); return done }
        catch { await storage.release(job); return .storageFailed(job.call) }
    }
}
