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

    @Test(arguments: [(true, SummariesState.Call.Stage.pending, SummariesState.Call.Stage.pending),
                      (false, .pending, .observed), (false, .succeeded, .succeeded), (true, .failed, .failed)])
    func aClaimTakesTheSavedJob(owned: Bool, saved: SummariesState.Call.Stage, stage: SummariesState.Call.Stage) {
        let record = SummariesSaved(stage: saved, job: makeJob(), identities: [makeIdentity()], warning: true, notes: "notes", terminal: .succeeded)
        assert(makeClaiming(requested: true), .claimed("call", owned: owned, record)) {
            $0.calls["call"] = .init(stage: stage, job: makeJob(), identities: [makeIdentity()], warning: true, notes: "notes",
                                     terminal: .succeeded, requested: true, status: "\(stage):true")
        }
        #expect(format.payloads == [.init(stage: stage, warning: true)])
    }
    @Test(arguments: [true, false]) func aClaimDeliversNothing(owned: Bool) {
        assert(makeClaiming(), .claimed("call", owned: owned, .init(stage: .pending, job: makeJob())), delivers: nil)
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
    private func makeSUT(_ preparation: PreparationSpy, _ claims: ClaimsSpy) -> SummariesEffectHandler {
        .init(preparation: preparation, claims: claims)
    }
}

func makeState(lifecycle: SummariesState.Lifecycle = .accepting, calls: [String: SummariesState.Call] = [:]) -> SummariesState {
    .init(lifecycle: lifecycle, calls: calls)
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
