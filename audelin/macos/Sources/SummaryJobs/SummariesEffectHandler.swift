/// Turns a submission into a job with whether notes are on, and a stored call into a submission.
public protocol SummariesPreparation: Sendable {
    /// The job for the submission, and whether notes are on at this moment.
    func job(for submission: SummariesSubmission) async -> (job: Job, notesOn: Bool)
    /// The call's stored transcript as a submission the user asked for.
    func submission(call: String) async throws -> SummariesSubmission
    /// The current final transcript's input identity, without capturing settings or making a job.
    func input(call: String) async throws -> String
}

public enum SummariesClaimIntent: Equatable, Sendable { case ifAbsent, newRun }

/// Takes a job into storage, or finds the one already there.
public protocol SummariesClaims: Sendable {
    func claim(_ job: Job, intent: SummariesClaimIntent) async throws -> (owned: Bool, saved: SummariesSaved)
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
    func publish(_ job: Job, notes: String, warning: Bool, keeping: SummariesKeeping) async throws
    func save(_ job: Job, stage: SummariesStage, warning: Bool) async throws
    /// Removes the job's record and releases this process's lease on it.
    func discard(_ job: Job) async throws
    /// Releases this process's lease on the job.
    func release(_ job: Job) async
}

/// Makes a job's speaker names and notes; each answer is already validated.
public protocol SummariesGeneration<Template>: Sendable {
    associatedtype Template: SummariesTemplate
    func identify(_ job: Job) async throws -> [Identity]
    func notes(_ job: Job, identities: [Identity], template: Template) async throws -> String
    /// Stops the job's running call and returns once it has ended; the call throws. Does nothing when none runs.
    func cancel(_ job: Job) async
}

public protocol SummariesTemplates<Template>: Sendable {
    associatedtype Template: SummariesTemplate
    /// Always answers, using built-in Default when its file cannot be used.
    func resolveDefault() async -> Template
    func resolve(_ name: String) async throws -> Template
}

/// Hands each effect to its collaborator and answers with the event its result means; it keeps nothing.
public struct SummariesEffectHandler<Template: SummariesTemplate>: Sendable {
    private let keeping: @Sendable () async -> Bool
    private let userName: @Sendable () async -> String?
    private let templates: any SummariesTemplates<Template>
    private let preparation: any SummariesPreparation
    private let claims: any SummariesClaims
    private let records: any SummariesRecords
    private let starts: any SummariesStarts
    private let storage: any SummariesStorage
    private let generation: any SummariesGeneration<Template>
    public init(keeping: @escaping @Sendable () async -> Bool, userName: @escaping @Sendable () async -> String? = { nil }, templates: any SummariesTemplates<Template>, preparation: any SummariesPreparation, claims: any SummariesClaims, records: any SummariesRecords,
                starts: any SummariesStarts, storage: any SummariesStorage, generation: any SummariesGeneration<Template>) {
        self.keeping = keeping; self.userName = userName
        self.templates = templates
        self.preparation = preparation; self.claims = claims; self.records = records; self.starts = starts
        self.storage = storage; self.generation = generation
    }
    public func handle(_ effect: SummariesEffect<Template>) async -> SummariesEvent<Template> {
        switch effect {
        case let .readKeeping(job): return .keepingRead(job.call, await keeping(), userName: await userName())
        case let .selectTemplate(job, name):
            do { return .templateSelected(job.call, try await templates.resolve(name)) }
            catch { return .templateFailed(job.call, String(describing: error)) }
        case let .read(call):
            do { return .submit(try await preparation.submission(call: call)) }
            catch { return .readFailed(call) }
        case let .start(job):
            do { return .started(job.call, owned: try await starts.start(job)) }
            catch { await storage.release(job); return .storageFailed(job.call) }
        case let .identify(job):
            do { return .identified(job.call, try await generation.identify(job)) }
            catch { return .identificationFailed(job.call) }
        case let .resolve(job):
            return .resolved(job.call, await templates.resolveDefault())
        case let .notes(job, identities, template):
            do { return .noted(job.call, try await generation.notes(job, identities: identities, template: template)) }
            catch { return .notesFailed(job.call, error as? SummariesFailure ?? .unknown) }
        case let .checkpoint(job, identities, warning):
            return await stored(job, .checkpointed(job.call)) { try await storage.checkpoint(job, identities: identities, warning: warning) }
        case let .publish(job, notes, warning, keeping):
            return await stored(job, .published(job.call)) { try await storage.publish(job, notes: notes, warning: warning, keeping: keeping) }
        case let .save(job, stage, warning):
            let event = await stored(job, .saved(job.call)) { try await storage.save(job, stage: stage, warning: warning) }
            if event == .saved(job.call) { await storage.release(job) }
            return event
        case let .discard(job):
            return await stored(job, .discarded(job.call)) { try await storage.discard(job) }
        case let .abort(job):
            await generation.cancel(job)
            return .aborted(job.call)
        case let .release(jobs):
            for job in jobs { await generation.cancel(job); await storage.release(job) }
            return .released
        case let .releaseReplacement(job):
            await storage.release(job)
            return .replacementReleased(job.call)
        case let .reload(calls):
            var results: [String: SummariesSaved?] = [:]
            for call in calls {
                do { results[call] = .some(try await loaded(call)) } catch {}
            }
            return .reloaded(results)
        case let .readInput(job):
            return .retryInput(job.call, try? await preparation.input(call: job.call))
        case let .retry(job):
            do { return .retried(job.call, try await records.retry(job)) }
            catch { return .retryFailed(job.call) }
        case let .load(call):
            do { return .recovered(call, try await loaded(call)) }
            catch { return .loadFailed(call) }
        case let .prepare(submission):
            let prepared = await preparation.job(for: submission)
            return .prepared(submission.call, prepared.job, notesOn: prepared.notesOn)
        case let .claim(job, intent):
            do {
                let result = try await claims.claim(job, intent: intent)
                return .claimed(job.call, owned: result.owned, result.saved)
            } catch { return .storageFailed(job.call) }
        }
    }
    private func loaded(_ call: String) async throws -> SummariesSaved? {
        guard var saved = try await records.load(call: call) else { return nil }
        if [.pending, .failed, .interrupted].contains(saved.stage) {
            saved.currentInput = try? await preparation.input(call: call)
        }
        return saved
    }
    /// Answers `done` after the write, or releases the job and answers a storage failure.
    private func stored(_ job: Job, _ done: SummariesEvent<Template>, _ write: () async throws -> Void) async -> SummariesEvent<Template> {
        do { try await write(); return done }
        catch { await storage.release(job); return .storageFailed(job.call) }
    }
}
