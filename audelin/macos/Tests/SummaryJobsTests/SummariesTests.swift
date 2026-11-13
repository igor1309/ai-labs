import Synchronization
import SummaryJobs
import Testing

@Suite struct SummariesTests {
    @Test func makingTheReducerRendersNothing() {
        let format = FormatSpy()
        _ = SummariesReducer(format: format.call)
        #expect(format.payloads.isEmpty)
    }
    @Test func aNewMachineAcceptsWithDispatchOnAndNoCalls() {
        let state = makeState()
        #expect(state.lifecycle == .accepting && state.dispatch && state.calls.isEmpty)
    }
}

@Suite struct SummariesSubmissionReducerTests {
    let format = FormatSpy()

    @Test(arguments: [false, true]) func aSubmissionForANewCallPreparesItsJob(requested: Bool) {
        let submission = makeSubmission(requested: requested)
        assert(makeState(), .submit(submission)) {
            $0.calls["call"] = .init(stage: .preparing, requested: requested, submission: submission, status: "preparing:false")
        }
        #expect(format.payloads == [.init(stage: .preparing, warning: false)])
    }
    @Test func aSubmissionForANewCallDeliversPrepare() {
        assert(makeState(), .submit(makeSubmission()), delivers: .prepare(makeSubmission()))
    }
    @Test func aSubmissionForAKnownCallChangesNothing() {
        assert(makeState(calls: ["call": .init(stage: .claiming)]), .submit(makeSubmission()))
        #expect(format.payloads.isEmpty)
    }
    @Test func aSubmissionForAKnownCallDeliversNothing() {
        assert(makeState(calls: ["call": .init(stage: .claiming)]), .submit(makeSubmission()), delivers: nil)
    }
    @Test(arguments: [SummariesState.Lifecycle.draining, .ended]) func aSubmissionAfterShutdownChangesNothing(lifecycle: SummariesState.Lifecycle) {
        assert(makeState(lifecycle: lifecycle), .submit(makeSubmission()))
    }
    @Test(arguments: [SummariesState.Lifecycle.draining, .ended]) func aSubmissionAfterShutdownDeliversNothing(lifecycle: SummariesState.Lifecycle) {
        assert(makeState(lifecycle: lifecycle), .submit(makeSubmission()), delivers: nil)
    }

    @Test func noJobForgetsTheCall() {
        assert(makePreparing(), .prepared("call", nil)) { $0.calls["call"] = nil }
        #expect(format.payloads.isEmpty)
    }
    @Test func noJobDeliversNothing() {
        assert(makePreparing(), .prepared("call", nil), delivers: nil)
    }
    @Test func anEligibleJobIsClaimed() {
        assert(makePreparing(), .prepared("call", makeJob())) {
            $0.calls["call"]?.stage = .claiming; $0.calls["call"]?.job = makeJob()
            $0.calls["call"]?.submission = nil; $0.calls["call"]?.status = "claiming:false"
        }
        #expect(format.payloads == [.init(stage: .claiming, warning: false)])
    }
    @Test func anEligibleJobDeliversClaim() {
        assert(makePreparing(), .prepared("call", makeJob()), delivers: .claim(makeJob()))
    }
    @Test(arguments: [(false, true, false), (true, false, false), (true, true, true)])
    func anIneligibleJobIsUnavailable(finalWrite: Bool, usable: Bool, empty: Bool) {
        let job = makeJob(entries: empty ? [] : makeEntries())
        assert(makePreparing(finalWrite: finalWrite, usable: usable), .prepared("call", job)) {
            $0.calls["call"]?.stage = .unavailable; $0.calls["call"]?.job = job
            $0.calls["call"]?.submission = nil; $0.calls["call"]?.status = "unavailable:false"
        }
    }
    @Test(arguments: [(false, true, false), (true, false, false), (true, true, true)])
    func anIneligibleJobDeliversNothing(finalWrite: Bool, usable: Bool, empty: Bool) {
        let job = makeJob(entries: empty ? [] : makeEntries())
        assert(makePreparing(finalWrite: finalWrite, usable: usable), .prepared("call", job), delivers: nil)
    }
    @Test func aJobForACallNotPreparingChangesNothing() {
        assert(makeState(calls: ["call": .init(stage: .claiming)]), .prepared("call", makeJob()))
    }
    @Test func aJobForACallNotPreparingDeliversNothing() {
        assert(makeState(calls: ["call": .init(stage: .claiming)]), .prepared("call", makeJob()), delivers: nil)
    }

    @Test(arguments: [(true, SummariesState.Call.Stage.pending, SummariesState.Call.Stage.starting),
                      (false, .pending, .observed), (false, .succeeded, .succeeded), (true, .failed, .failed)])
    func aClaimTakesTheSavedJob(owned: Bool, saved: SummariesState.Call.Stage, stage: SummariesState.Call.Stage) {
        let record = SummariesSaved(stage: saved, job: makeJob(), identities: [makeIdentity()], warning: true, notes: "notes", terminal: .succeeded)
        assert(makeClaiming(requested: true), .claimed("call", owned: owned, record)) {
            $0.calls["call"] = .init(stage: stage, job: makeJob(), identities: [makeIdentity()], warning: true, notes: "notes",
                                     terminal: .succeeded, requested: true, status: "\(stage):true")
        }
        #expect(format.payloads == [.init(stage: stage, warning: true)])
    }
    @Test func aClaimNotPendingDeliversNothing() {
        assert(makeClaiming(), .claimed("call", owned: true, .init(stage: .noting, job: makeJob())), delivers: nil)
    }
    @Test func anObservedClaimDeliversNothing() {
        assert(makeClaiming(), .claimed("call", owned: false, .init(stage: .pending, job: makeJob())), delivers: nil)
    }
    @Test func aClaimForACallNotClaimingChangesNothing() {
        assert(makePreparing(), .claimed("call", owned: true, .init(stage: .pending, job: makeJob())))
    }
    @Test func aClaimForACallNotClaimingDeliversNothing() {
        assert(makePreparing(), .claimed("call", owned: true, .init(stage: .pending, job: makeJob())), delivers: nil)
    }
    @Test func aFailedClaimFailsTheCall() {
        assert(makeClaiming(), .storageFailed("call")) { $0.calls["call"]?.stage = .failed; $0.calls["call"]?.status = "failed:false" }
    }
    @Test func aFailedClaimDeliversNothing() {
        assert(makeClaiming(), .storageFailed("call"), delivers: nil)
    }
    @Test func aStorageFailureForACallNotClaimingChangesNothing() {
        assert(makePreparing(), .storageFailed("call"))
    }

    private func assert(_ state: SummariesState, _ event: SummariesEvent, changes: (inout SummariesState) -> Void = { _ in },
                        sourceLocation: SourceLocation = #_sourceLocation) {
        var expected = state; changes(&expected)
        #expect(SummariesReducer(format: format.call).reduce(state, event).0 == expected, sourceLocation: sourceLocation)
    }
    private func assert(_ state: SummariesState, _ event: SummariesEvent, delivers effect: SummariesEffect?,
                        sourceLocation: SourceLocation = #_sourceLocation) {
        #expect(SummariesReducer(format: format.call).reduce(state, event).1 == effect, sourceLocation: sourceLocation)
    }
}

@Suite struct SummariesSubmissionEffectHandlerTests {
    @Test func prepareHandsTheSubmissionToPreparation() async {
        let preparation = PreparationSpy(job: nil), claims = ClaimsSpy()
        _ = await makeSUT(preparation, claims).handle(.prepare(makeSubmission(requested: true)))
        #expect(preparation.payloads == [makeSubmission(requested: true)])
    }
    @Test(arguments: [false, true]) func prepareDeliversThePreparedJob(found: Bool) async {
        let job = found ? makeJob() : nil
        let event = await makeSUT(PreparationSpy(job: job), ClaimsSpy()).handle(.prepare(makeSubmission()))
        #expect(event == .prepared("call", job))
    }
    @Test func prepareDoesNotClaim() async {
        let claims = ClaimsSpy()
        _ = await makeSUT(PreparationSpy(job: makeJob()), claims).handle(.prepare(makeSubmission()))
        #expect(claims.payloads.isEmpty)
    }
    @Test func claimHandsTheJobToClaims() async {
        let claims = ClaimsSpy()
        _ = await makeSUT(PreparationSpy(job: nil), claims).handle(.claim(makeJob()))
        #expect(claims.payloads == [makeJob()])
    }
    @Test(arguments: [false, true]) func claimDeliversWhatStorageHolds(owned: Bool) async {
        let saved = SummariesSaved(stage: .identifying, job: makeJob(), warning: true)
        let event = await makeSUT(PreparationSpy(job: nil), ClaimsSpy(result: .success((owned, saved)))).handle(.claim(makeJob()))
        #expect(event == .claimed("call", owned: owned, saved))
    }
    @Test func aFailedClaimDeliversStorageFailure() async {
        let event = await makeSUT(PreparationSpy(job: nil), ClaimsSpy(result: .failure(SpyFailure()))).handle(.claim(makeJob()))
        #expect(event == .storageFailed("call"))
    }
    @Test func claimDoesNotPrepare() async {
        let preparation = PreparationSpy(job: nil)
        _ = await makeSUT(preparation, ClaimsSpy()).handle(.claim(makeJob()))
        #expect(preparation.payloads.isEmpty)
    }
    @Test func prepareAndClaimDoNotLoad() async {
        let records = RecordsSpy()
        let sut = SummariesEffectHandler(preparation: PreparationSpy(job: makeJob()), claims: ClaimsSpy(), records: records, starts: StartsSpy(), storage: StorageSpy(), generation: GenerationsSpy())
        _ = await sut.handle(.prepare(makeSubmission()))
        _ = await sut.handle(.claim(makeJob()))
        #expect(records.payloads.isEmpty)
    }
    private func makeSUT(_ preparation: PreparationSpy, _ claims: ClaimsSpy) -> SummariesEffectHandler {
        .init(preparation: preparation, claims: claims, records: RecordsSpy(), starts: StartsSpy(), storage: StorageSpy(), generation: GenerationsSpy())
    }
}

@Suite struct SummariesRecoveryReducerTests {
    let format = FormatSpy()
    let saved = SummariesSaved(stage: .noting, job: makeJob(), identities: [makeIdentity()], warning: true, notes: "notes", terminal: .succeeded)

    @Test func recoveringANewCallLoadsIt() {
        assert(makeState(), .recover("call")) { $0.calls["call"] = .init(stage: .recovering, status: "recovering:false") }
        #expect(format.payloads == [.init(stage: .recovering, warning: false)])
    }
    @Test func recoveringANewCallDeliversLoad() {
        assert(makeState(), .recover("call"), delivers: .load("call"))
    }
    @Test func recoveringAKnownCallChangesNothing() {
        assert(makeClaiming(), .recover("call"))
        #expect(format.payloads.isEmpty)
    }
    @Test func recoveringAKnownCallDeliversNothing() {
        assert(makeClaiming(), .recover("call"), delivers: nil)
    }
    @Test(arguments: [SummariesState.Lifecycle.draining, .ended]) func recoveringAfterShutdownChangesNothing(lifecycle: SummariesState.Lifecycle) {
        assert(makeState(lifecycle: lifecycle), .recover("call"))
    }
    @Test(arguments: [SummariesState.Lifecycle.draining, .ended]) func recoveringAfterShutdownDeliversNothing(lifecycle: SummariesState.Lifecycle) {
        assert(makeState(lifecycle: lifecycle), .recover("call"), delivers: nil)
    }

    @Test func aSubmissionWhileRecoveringWaits() {
        assert(makeRecovering(), .submit(makeSubmission(requested: true))) { $0.calls["call"]?.submission = makeSubmission(requested: true) }
        #expect(format.payloads.isEmpty)
    }
    @Test func aSubmissionWhileRecoveringDeliversNothing() {
        assert(makeRecovering(), .submit(makeSubmission()), delivers: nil)
    }
    @Test func aSecondSubmissionWhileRecoveringChangesNothing() {
        assert(makeRecovering(submission: makeSubmission()), .submit(makeSubmission(requested: true)))
    }

    @Test(arguments: [false, true]) func aSavedJobIsInstalled(queued: Bool) {
        assert(makeRecovering(submission: queued ? makeSubmission() : nil), .recovered("call", saved)) {
            $0.calls["call"] = .init(stage: .noting, job: makeJob(), identities: [makeIdentity()], warning: true, notes: "notes",
                                     terminal: .succeeded, status: "noting:true")
        }
        #expect(format.payloads == [.init(stage: .noting, warning: true)])
    }
    @Test(arguments: [false, true]) func aSavedJobDeliversNothing(queued: Bool) {
        assert(makeRecovering(submission: queued ? makeSubmission() : nil), .recovered("call", saved), delivers: nil)
    }
    @Test func noSavedJobForgetsTheCall() {
        assert(makeRecovering(), .recovered("call", nil)) { $0.calls["call"] = nil }
        #expect(format.payloads.isEmpty)
    }
    @Test func noSavedJobDeliversNothing() {
        assert(makeRecovering(), .recovered("call", nil), delivers: nil)
    }
    @Test func noSavedJobPreparesTheQueuedSubmission() {
        assert(makeRecovering(submission: makeSubmission(requested: true)), .recovered("call", nil)) {
            $0.calls["call"] = .init(stage: .preparing, requested: true, submission: makeSubmission(requested: true), status: "preparing:false")
        }
        #expect(format.payloads == [.init(stage: .preparing, warning: false)])
    }
    @Test func noSavedJobDeliversPrepareForTheQueuedSubmission() {
        assert(makeRecovering(submission: makeSubmission()), .recovered("call", nil), delivers: .prepare(makeSubmission()))
    }
    @Test func aLoadFailureFailsTheCall() {
        assert(makeRecovering(submission: makeSubmission()), .loadFailed("call")) { $0.calls["call"] = .init(stage: .failed, status: "failed:false") }
        #expect(format.payloads == [.init(stage: .failed, warning: false)])
    }
    @Test func aLoadFailureDeliversNothing() {
        assert(makeRecovering(), .loadFailed("call"), delivers: nil)
    }
    @Test func recoveryResultsForACallNotRecoveringChangeNothing() {
        assert(makeClaiming(), .recovered("call", saved))
        assert(makeClaiming(), .recovered("call", nil))
        assert(makeClaiming(), .loadFailed("call"))
    }
    @Test func recoveryResultsForACallNotRecoveringDeliverNothing() {
        assert(makeClaiming(), .recovered("call", nil), delivers: nil)
        assert(makeClaiming(), .loadFailed("call"), delivers: nil)
    }

    private func makeRecovering(submission: SummariesSubmission? = nil) -> SummariesState {
        makeState(calls: ["call": .init(stage: .recovering, submission: submission)])
    }
    private func assert(_ state: SummariesState, _ event: SummariesEvent, changes: (inout SummariesState) -> Void = { _ in },
                        sourceLocation: SourceLocation = #_sourceLocation) {
        var expected = state; changes(&expected)
        #expect(SummariesReducer(format: format.call).reduce(state, event).0 == expected, sourceLocation: sourceLocation)
    }
    private func assert(_ state: SummariesState, _ event: SummariesEvent, delivers effect: SummariesEffect?,
                        sourceLocation: SourceLocation = #_sourceLocation) {
        #expect(SummariesReducer(format: format.call).reduce(state, event).1 == effect, sourceLocation: sourceLocation)
    }
}

@Suite struct SummariesRecoveryEffectHandlerTests {
    @Test func loadAsksRecordsForTheCall() async {
        let records = RecordsSpy()
        _ = await makeSUT(records).handle(.load("call"))
        #expect(records.payloads == ["call"])
    }
    @Test(arguments: [false, true]) func loadDeliversWhatStorageHolds(found: Bool) async {
        let saved = found ? SummariesSaved(stage: .noting, job: makeJob()) : nil
        let event = await makeSUT(RecordsSpy(result: .success(saved))).handle(.load("call"))
        #expect(event == .recovered("call", saved))
    }
    @Test func aFailedLoadDeliversLoadFailure() async {
        let event = await makeSUT(RecordsSpy(result: .failure(SpyFailure()))).handle(.load("call"))
        #expect(event == .loadFailed("call"))
    }
    @Test func loadDoesNotPrepareOrClaim() async {
        let preparation = PreparationSpy(job: nil), claims = ClaimsSpy()
        _ = await SummariesEffectHandler(preparation: preparation, claims: claims, records: RecordsSpy(), starts: StartsSpy(), storage: StorageSpy(), generation: GenerationsSpy()).handle(.load("call"))
        #expect(preparation.payloads.isEmpty && claims.payloads.isEmpty)
    }
    private func makeSUT(_ records: RecordsSpy) -> SummariesEffectHandler {
        .init(preparation: PreparationSpy(job: nil), claims: ClaimsSpy(), records: records, starts: StartsSpy(), storage: StorageSpy(), generation: GenerationsSpy())
    }
}

@Suite struct SummariesDispatchReducerTests {
    let format = FormatSpy()
    let pending = SummariesSaved(stage: .pending, job: makeJob(), warning: true)

    @Test func anOwnedPendingClaimStartsWhileDispatching() {
        assert(makeClaiming(), .claimed("call", owned: true, pending)) {
            $0.calls["call"] = .init(stage: .starting, job: makeJob(), warning: true, status: "starting:true")
        }
        #expect(format.payloads == [.init(stage: .starting, warning: true)])
    }
    @Test func anOwnedPendingClaimDeliversStartWhileDispatching() {
        assert(makeClaiming(), .claimed("call", owned: true, pending), delivers: .start(makeJob()))
    }
    @Test func anOwnedPendingClaimStaysPendingWithoutDispatch() {
        assert(makeClaiming(dispatch: false), .claimed("call", owned: true, pending)) {
            $0.calls["call"] = .init(stage: .pending, job: makeJob(), warning: true, status: "pending:true")
        }
    }
    @Test func anOwnedPendingClaimDeliversNothingWithoutDispatch() {
        assert(makeClaiming(dispatch: false), .claimed("call", owned: true, pending), delivers: nil)
    }
    @Test func aRecoveredPendingJobStartsWhileDispatching() {
        assert(makeRecovering(), .recovered("call", pending)) {
            $0.calls["call"] = .init(stage: .starting, job: makeJob(), warning: true, status: "starting:true")
        }
        #expect(format.payloads == [.init(stage: .starting, warning: true)])
    }
    @Test func aRecoveredPendingJobDeliversStartWhileDispatching() {
        assert(makeRecovering(), .recovered("call", pending), delivers: .start(makeJob()))
    }
    @Test func aRecoveredPendingJobStaysPendingWithoutDispatch() {
        assert(makeRecovering(dispatch: false), .recovered("call", pending)) {
            $0.calls["call"] = .init(stage: .pending, job: makeJob(), warning: true, status: "pending:true")
        }
    }
    @Test func aRecoveredPendingJobDeliversNothingWithoutDispatch() {
        assert(makeRecovering(dispatch: false), .recovered("call", pending), delivers: nil)
    }

    @Test(arguments: [(true, true, SummariesState.Call.Stage.identifying), (true, false, .noting), (false, true, .observed)])
    func anAnsweredStartMovesOn(owned: Bool, speakers: Bool, stage: SummariesState.Call.Stage) {
        assert(makeStarting(speakers: speakers), .started("call", owned: owned)) {
            $0.calls["call"]?.stage = stage; $0.calls["call"]?.status = "\(stage):false"
        }
        #expect(format.payloads == [.init(stage: stage, warning: false)])
    }
    @Test func anOwnedStartWithSpeakersDeliversIdentify() {
        assert(makeStarting(), .started("call", owned: true), delivers: .identify(makeJob()))
    }
    @Test func anOwnedStartWithoutSpeakersDeliversNotes() {
        var job = makeJob(); job.speakers = false
        assert(makeStarting(speakers: false), .started("call", owned: true), delivers: .notes(job, []))
    }
    @Test func anObservedStartDeliversNothing() {
        assert(makeStarting(), .started("call", owned: false), delivers: nil)
    }
    @Test func aStartAnswerForACallNotStartingChangesNothing() {
        assert(makePending(), .started("call", owned: true))
    }
    @Test func aStartAnswerForACallNotStartingDeliversNothing() {
        assert(makePending(), .started("call", owned: true), delivers: nil)
    }
    @Test func aFailedStartFailsTheCall() {
        assert(makeStarting(), .storageFailed("call")) { $0.calls["call"]?.stage = .failed; $0.calls["call"]?.status = "failed:false" }
    }
    @Test func aFailedStartDeliversNothing() {
        assert(makeStarting(), .storageFailed("call"), delivers: nil)
    }

    @Test func stoppingDispatchTakesDueStartsBackToPending() {
        var state = makeStarting()
        state.calls["other"] = .init(stage: .noting, job: makeJob())
        assert(state, .stopDispatch) {
            $0.dispatch = false; $0.calls["call"]?.stage = .pending; $0.calls["call"]?.status = "pending:false"
        }
        #expect(format.payloads == [.init(stage: .pending, warning: false)])
    }
    @Test func stoppingDispatchDeliversNothing() {
        assert(makeStarting(), .stopDispatch, delivers: nil)
    }
    @Test func stoppingStoppedDispatchChangesNothing() {
        assert(makeState(dispatch: false), .stopDispatch)
        #expect(format.payloads.isEmpty)
    }
    @Test func stoppingStoppedDispatchDeliversNothing() {
        assert(makeState(dispatch: false), .stopDispatch, delivers: nil)
    }

    private func makeClaiming(dispatch: Bool = true) -> SummariesState {
        makeState(dispatch: dispatch, calls: ["call": .init(stage: .claiming, job: makeJob())])
    }
    private func makeRecovering(dispatch: Bool = true) -> SummariesState {
        makeState(dispatch: dispatch, calls: ["call": .init(stage: .recovering)])
    }
    private func makeStarting(speakers: Bool = true) -> SummariesState {
        var job = makeJob(); job.speakers = speakers
        return makeState(calls: ["call": .init(stage: .starting, job: job)])
    }
    private func makePending() -> SummariesState {
        makeState(calls: ["call": .init(stage: .pending, job: makeJob())])
    }
    private func assert(_ state: SummariesState, _ event: SummariesEvent, changes: (inout SummariesState) -> Void = { _ in },
                        sourceLocation: SourceLocation = #_sourceLocation) {
        var expected = state; changes(&expected)
        #expect(SummariesReducer(format: format.call).reduce(state, event).0 == expected, sourceLocation: sourceLocation)
    }
    private func assert(_ state: SummariesState, _ event: SummariesEvent, delivers effect: SummariesEffect?,
                        sourceLocation: SourceLocation = #_sourceLocation) {
        #expect(SummariesReducer(format: format.call).reduce(state, event).1 == effect, sourceLocation: sourceLocation)
    }
}

@Suite struct SummariesDispatchEffectHandlerTests {
    @Test func startHandsTheJobToStarts() async {
        let starts = StartsSpy()
        _ = await makeSUT(starts).handle(.start(makeJob()))
        #expect(starts.payloads == [makeJob()])
    }
    @Test(arguments: [false, true]) func startDeliversWhetherItIsOwned(owned: Bool) async {
        let event = await makeSUT(StartsSpy(result: .success(owned))).handle(.start(makeJob()))
        #expect(event == .started("call", owned: owned))
    }
    @Test func aFailedStartDeliversStorageFailure() async {
        let event = await makeSUT(StartsSpy(result: .failure(SpyFailure()))).handle(.start(makeJob()))
        #expect(event == .storageFailed("call"))
    }
    @Test func aFailedStartReleasesTheJob() async {
        let storage = StorageSpy()
        _ = await SummariesEffectHandler(preparation: PreparationSpy(job: nil), claims: ClaimsSpy(), records: RecordsSpy(),
                                         starts: StartsSpy(result: .failure(SpyFailure())), storage: storage, generation: GenerationsSpy())
            .handle(.start(makeJob()))
        #expect(storage.payloads == [.release(makeJob())])
    }
    @Test func startDoesNothingElse() async {
        let preparation = PreparationSpy(job: nil), claims = ClaimsSpy(), records = RecordsSpy()
        _ = await SummariesEffectHandler(preparation: preparation, claims: claims, records: records, starts: StartsSpy(), storage: StorageSpy(), generation: GenerationsSpy()).handle(.start(makeJob()))
        #expect(preparation.payloads.isEmpty && claims.payloads.isEmpty && records.payloads.isEmpty)
    }
    @Test func otherEffectsDoNotStart() async {
        let starts = StartsSpy(), sut = makeSUT(starts)
        _ = await sut.handle(.load("call")); _ = await sut.handle(.prepare(makeSubmission())); _ = await sut.handle(.claim(makeJob()))
        #expect(starts.payloads.isEmpty)
    }
    private func makeSUT(_ starts: StartsSpy) -> SummariesEffectHandler {
        .init(preparation: PreparationSpy(job: nil), claims: ClaimsSpy(), records: RecordsSpy(), starts: starts, storage: StorageSpy(), generation: GenerationsSpy())
    }
}

func makeState(lifecycle: SummariesState.Lifecycle = .accepting, dispatch: Bool = true, calls: [String: SummariesState.Call] = [:]) -> SummariesState {
    .init(lifecycle: lifecycle, dispatch: dispatch, calls: calls)
}
func makeEntries() -> [Job.Entry] { [.init(label: "A", time: "0", text: "spoken")] }
func makeJob(entries: [Job.Entry] = makeEntries()) -> Job {
    .init(id: "job", call: "call", input: "input", entries: entries, speakers: true,
          primary: .init(kind: "cli", model: "m", program: "p", endpoint: "", credentialVariable: ""))
}
func makeIdentity() -> Identity { .init(label: "A", name: "Ann", time: "0", quote: "I am Ann") }
func makeSubmission(finalWrite: Bool = true, usable: Bool = true, requested: Bool = false) -> SummariesSubmission {
    .init(call: "call", input: "input", entries: makeEntries(), finalWrite: finalWrite, usable: usable, requested: requested)
}
func makePreparing(finalWrite: Bool = true, usable: Bool = true) -> SummariesState {
    makeState(calls: ["call": .init(stage: .preparing, submission: makeSubmission(finalWrite: finalWrite, usable: usable))])
}
func makeClaiming(requested: Bool = false) -> SummariesState {
    makeState(calls: ["call": .init(stage: .claiming, job: makeJob(), requested: requested)])
}

/// Records each status the reducer renders and answers with a stub that names its payload.
final class FormatSpy: Sendable {
    struct Payload: Equatable, Sendable { let stage: SummariesState.Call.Stage; let warning: Bool }
    private let recorded = Mutex<[Payload]>([])
    var payloads: [Payload] { recorded.withLock { $0 } }
    var call: @Sendable (SummariesState.Call.Stage, Bool) -> String {
        { [self] stage, warning in
            recorded.withLock { $0.append(.init(stage: stage, warning: warning)) }
            return "\(stage):\(warning)"
        }
    }
}
struct SpyFailure: Error {}
final class PreparationSpy: SummariesPreparation {
    private let recorded = Mutex<[SummariesSubmission]>([])
    private let job: Job?
    init(job: Job?) { self.job = job }
    var payloads: [SummariesSubmission] { recorded.withLock { $0 } }
    func job(for submission: SummariesSubmission) async -> Job? { recorded.withLock { $0.append(submission) }; return job }
}
final class ClaimsSpy: SummariesClaims {
    private let recorded = Mutex<[Job]>([])
    private let result: Result<(Bool, SummariesSaved), SpyFailure>
    init(result: Result<(Bool, SummariesSaved), SpyFailure> = .success((true, .init(stage: .pending, job: makeJob())))) { self.result = result }
    var payloads: [Job] { recorded.withLock { $0 } }
    func claim(_ job: Job) async throws -> (owned: Bool, saved: SummariesSaved) {
        recorded.withLock { $0.append(job) }
        let (owned, saved) = try result.get(); return (owned, saved)
    }
}
final class RecordsSpy: SummariesRecords {
    private let recorded = Mutex<[String]>([])
    private let result: Result<SummariesSaved?, SpyFailure>
    private let retried: Result<SummariesSaved, SpyFailure>
    init(result: Result<SummariesSaved?, SpyFailure> = .success(nil),
         retried: Result<SummariesSaved, SpyFailure> = .success(.init(stage: .pending, job: makeJob()))) {
        self.result = result; self.retried = retried
    }
    var payloads: [String] { recorded.withLock { $0 } }
    func load(call: String) async throws -> SummariesSaved? { recorded.withLock { $0.append(call) }; return try result.get() }
    func retry(_ job: Job) async throws -> SummariesSaved { recorded.withLock { $0.append("retry:\(job.id)") }; return try retried.get() }
}
final class StartsSpy: SummariesStarts {
    private let recorded = Mutex<[Job]>([])
    private let result: Result<Bool, SpyFailure>
    init(result: Result<Bool, SpyFailure> = .success(true)) { self.result = result }
    var payloads: [Job] { recorded.withLock { $0 } }
    func start(_ job: Job) async throws -> Bool { recorded.withLock { $0.append(job) }; return try result.get() }
}
