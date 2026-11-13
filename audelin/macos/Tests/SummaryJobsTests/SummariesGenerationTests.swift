import Synchronization
import SummaryJobs
import Testing

@Suite struct SummariesGenerationReducerTests {
    let format = FormatSpy()
    let identities = [makeIdentity()]

    @Test func identitiesAreCheckpointed() {
        assert(make(.identifying), .identified("call", identities)) {
            $0.calls["call"]?.identities = identities; $0.calls["call"]?.stage = .checkpointing; $0.calls["call"]?.status = "checkpointing:false"
        }
        #expect(format.payloads == [.init(stage: .checkpointing, warning: false)])
    }
    @Test func identitiesDeliverCheckpoint() {
        assert(make(.identifying), .identified("call", identities), delivers: .checkpoint(makeJob(), identities, warning: false))
    }
    @Test func aFailedIdentificationIsCheckpointedWithAWarning() {
        assert(make(.identifying), .identificationFailed("call")) {
            $0.calls["call"]?.warning = true; $0.calls["call"]?.stage = .checkpointing; $0.calls["call"]?.status = "checkpointing:true"
        }
        #expect(format.payloads == [.init(stage: .checkpointing, warning: true)])
    }
    @Test func aFailedIdentificationDeliversAWarningCheckpoint() {
        assert(make(.identifying), .identificationFailed("call"), delivers: .checkpoint(makeJob(), [], warning: true))
    }
    @Test func aCheckpointMakesNotes() {
        assert(make(.checkpointing, identities: identities), .checkpointed("call")) {
            $0.calls["call"]?.stage = .noting; $0.calls["call"]?.status = "noting:false"
        }
        #expect(format.payloads == [.init(stage: .noting, warning: false)])
    }
    @Test func aCheckpointDeliversNotesWithTheIdentities() {
        assert(make(.checkpointing, identities: identities), .checkpointed("call"), delivers: .notes(makeJob(), identities))
    }
    @Test func notesArePublished() {
        assert(make(.noting), .noted("call", "notes")) {
            $0.calls["call"]?.notes = "notes"; $0.calls["call"]?.stage = .publishing; $0.calls["call"]?.status = "publishing:false"
        }
        #expect(format.payloads == [.init(stage: .publishing, warning: false)])
    }
    @Test(arguments: [false, true]) func notesDeliverPublishWithTheWarning(warning: Bool) {
        assert(make(.noting, warning: warning), .noted("call", "notes"), delivers: .publish(makeJob(), "notes", warning: warning))
    }
    @Test func failedNotesAreSavedAsFailed() {
        assert(make(.noting), .notesFailed("call")) {
            $0.calls["call"]?.stage = .saving; $0.calls["call"]?.terminal = .failed; $0.calls["call"]?.status = "saving:false"
        }
        #expect(format.payloads == [.init(stage: .saving, warning: false)])
    }
    @Test(arguments: [false, true]) func failedNotesDeliverAFailedSave(warning: Bool) {
        assert(make(.noting, warning: warning), .notesFailed("call"), delivers: .save(makeJob(), .failed, warning: warning))
    }
    @Test func publishedNotesAreSavedAsSucceeded() {
        assert(make(.publishing), .published("call")) {
            $0.calls["call"]?.stage = .saving; $0.calls["call"]?.terminal = .succeeded; $0.calls["call"]?.status = "saving:false"
        }
    }
    @Test(arguments: [false, true]) func publishedNotesDeliverASucceededSave(warning: Bool) {
        assert(make(.publishing, warning: warning), .published("call"), delivers: .save(makeJob(), .succeeded, warning: warning))
    }
    @Test(arguments: [SummariesState.Call.Stage.succeeded, .failed]) func aSaveEndsInItsTerminal(terminal: SummariesState.Call.Stage) {
        assert(make(.saving, terminal: terminal), .saved("call")) {
            $0.calls["call"]?.stage = terminal; $0.calls["call"]?.status = "\(terminal):false"
        }
        #expect(format.payloads == [.init(stage: terminal, warning: false)])
    }
    @Test func aSaveDeliversNothing() {
        assert(make(.saving, terminal: .succeeded), .saved("call"), delivers: nil)
    }

    @Test(arguments: [SummariesState.Call.Stage.starting, .identifying, .checkpointing, .noting, .publishing, .saving])
    func aStorageFailureFailsWork(stage: SummariesState.Call.Stage) {
        assert(make(stage), .storageFailed("call")) { $0.calls["call"]?.stage = .failed; $0.calls["call"]?.status = "failed:false" }
    }
    @Test(arguments: [SummariesState.Call.Stage.starting, .identifying, .checkpointing, .noting, .publishing, .saving])
    func aStorageFailureDeliversNothing(stage: SummariesState.Call.Stage) {
        assert(make(stage), .storageFailed("call"), delivers: nil)
    }
    @Test(arguments: [SummariesState.Call.Stage.pending, .succeeded, .failed, .observed, .unavailable])
    func aStorageFailureOutsideWorkChangesNothing(stage: SummariesState.Call.Stage) {
        assert(make(stage), .storageFailed("call"))
        #expect(format.payloads.isEmpty)
    }

    @Test(arguments: [SummariesEvent.identified("call", []), .identificationFailed("call"), .checkpointed("call"), .noted("call", "n"),
                      .notesFailed("call"), .published("call"), .saved("call")])
    func aResultForAnotherStageChangesNothing(event: SummariesEvent) {
        assert(make(.pending), event)
        #expect(format.payloads.isEmpty)
    }
    @Test(arguments: [SummariesEvent.identified("call", []), .identificationFailed("call"), .checkpointed("call"), .noted("call", "n"),
                      .notesFailed("call"), .published("call"), .saved("call")])
    func aResultForAnotherStageDeliversNothing(event: SummariesEvent) {
        assert(make(.pending), event, delivers: nil)
    }

    private func make(_ stage: SummariesState.Call.Stage, identities: [Identity] = [], warning: Bool = false,
                      terminal: SummariesState.Call.Stage? = nil) -> SummariesState {
        makeState(calls: ["call": .init(stage: stage, job: makeJob(), identities: identities, warning: warning, terminal: terminal)])
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

@Suite struct SummariesGenerationEffectHandlerTests {
    let identities = [makeIdentity()]

    @Test func identifyAsksGeneration() async {
        let generation = GenerationsSpy()
        _ = await makeSUT(generation: generation).handle(.identify(makeJob()))
        #expect(generation.payloads == [.identify(makeJob())])
    }
    @Test func identifyDeliversTheIdentities() async {
        let event = await makeSUT(generation: GenerationsSpy(identities: identities)).handle(.identify(makeJob()))
        #expect(event == .identified("call", identities))
    }
    @Test func aFailedIdentifyDeliversIdentificationFailure() async {
        let storage = StorageSpy()
        let event = await makeSUT(storage, GenerationsSpy(fails: true)).handle(.identify(makeJob()))
        #expect(event == .identificationFailed("call") && storage.payloads.isEmpty)
    }
    @Test func notesAsksGenerationWithTheIdentities() async {
        let generation = GenerationsSpy()
        _ = await makeSUT(generation: generation).handle(.notes(makeJob(), identities))
        #expect(generation.payloads == [.notes(makeJob(), identities)])
    }
    @Test func notesDeliverTheNotes() async {
        let event = await makeSUT(generation: GenerationsSpy(notes: "made")).handle(.notes(makeJob(), []))
        #expect(event == .noted("call", "made"))
    }
    @Test func failedNotesDeliverNotesFailure() async {
        let storage = StorageSpy()
        let event = await makeSUT(storage, GenerationsSpy(fails: true)).handle(.notes(makeJob(), []))
        #expect(event == .notesFailed("call") && storage.payloads.isEmpty)
    }

    @Test func checkpointWritesAndDeliversCheckpointed() async {
        let storage = StorageSpy()
        let event = await makeSUT(storage).handle(.checkpoint(makeJob(), identities, warning: true))
        #expect(event == .checkpointed("call") && storage.payloads == [.checkpoint(makeJob(), identities, true)])
    }
    @Test func publishWritesAndDeliversPublished() async {
        let storage = StorageSpy()
        let event = await makeSUT(storage).handle(.publish(makeJob(), "notes", warning: true))
        #expect(event == .published("call") && storage.payloads == [.publish(makeJob(), "notes", true)])
    }
    @Test func saveWritesReleasesAndDeliversSaved() async {
        let storage = StorageSpy()
        let event = await makeSUT(storage).handle(.save(makeJob(), .succeeded, warning: true))
        #expect(event == .saved("call") && storage.payloads == [.save(makeJob(), .succeeded, true), .release(makeJob())])
    }
    @Test(arguments: [SummariesEffect.checkpoint(makeJob(), [], warning: false), .publish(makeJob(), "n", warning: false),
                      .save(makeJob(), .failed, warning: false)])
    func aFailedWriteReleasesAndDeliversStorageFailure(effect: SummariesEffect) async {
        let storage = StorageSpy(fails: true)
        let event = await makeSUT(storage).handle(effect)
        #expect(event == .storageFailed("call") && storage.payloads.last == .release(makeJob()) && storage.payloads.count == 2)
    }
    @Test(arguments: [SummariesEffect.checkpoint(makeJob(), [], warning: false), .publish(makeJob(), "n", warning: false),
                      .save(makeJob(), .failed, warning: false)])
    func writesDoNotGenerate(effect: SummariesEffect) async {
        let generation = GenerationsSpy()
        _ = await makeSUT(generation: generation).handle(effect)
        #expect(generation.payloads.isEmpty)
    }
    @Test(arguments: [SummariesEffect.load("call"), .prepare(makeSubmission()), .claim(makeJob())])
    func otherEffectsDoNotWriteOrGenerate(effect: SummariesEffect) async {
        let storage = StorageSpy(), generation = GenerationsSpy()
        _ = await makeSUT(storage, generation).handle(effect)
        #expect(storage.payloads.isEmpty && generation.payloads.isEmpty)
    }

    private func makeSUT(_ storage: StorageSpy = StorageSpy(), _ generation: GenerationsSpy = GenerationsSpy()) -> SummariesEffectHandler {
        .init(preparation: PreparationSpy(job: nil), claims: ClaimsSpy(), records: RecordsSpy(), starts: StartsSpy(),
              storage: storage, generation: generation)
    }
    private func makeSUT(generation: GenerationsSpy) -> SummariesEffectHandler { makeSUT(StorageSpy(), generation) }
}

final class StorageSpy: SummariesStorage {
    enum Payload: Equatable, Sendable {
        case checkpoint(Job, [Identity], Bool), publish(Job, String, Bool), save(Job, SummariesState.Call.Stage, Bool), discard(Job), release(Job)
    }
    private let recorded = Mutex<[Payload]>([])
    private let fails: Bool
    init(fails: Bool = false) { self.fails = fails }
    var payloads: [Payload] { recorded.withLock { $0 } }
    func checkpoint(_ job: Job, identities: [Identity], warning: Bool) async throws { try record(.checkpoint(job, identities, warning)) }
    func publish(_ job: Job, notes: String, warning: Bool) async throws { try record(.publish(job, notes, warning)) }
    func save(_ job: Job, stage: SummariesState.Call.Stage, warning: Bool) async throws { try record(.save(job, stage, warning)) }
    func discard(_ job: Job) async throws { try record(.discard(job)) }
    func release(_ job: Job) async { recorded.withLock { $0.append(.release(job)) } }
    private func record(_ payload: Payload) throws {
        recorded.withLock { $0.append(payload) }
        if fails { throw SpyFailure() }
    }
}
final class GenerationsSpy: SummariesGeneration {
    enum Payload: Equatable, Sendable { case identify(Job), notes(Job, [Identity]) }
    private let recorded = Mutex<[Payload]>([])
    private let identities: [Identity], notes: String, fails: Bool
    init(identities: [Identity] = [], notes: String = "notes", fails: Bool = false) {
        self.identities = identities; self.notes = notes; self.fails = fails
    }
    var payloads: [Payload] { recorded.withLock { $0 } }
    func identify(_ job: Job) async throws -> [Identity] {
        recorded.withLock { $0.append(.identify(job)) }
        if fails { throw SpyFailure() }; return identities
    }
    func notes(_ job: Job, identities: [Identity]) async throws -> String {
        recorded.withLock { $0.append(.notes(job, identities)) }
        if fails { throw SpyFailure() }; return notes
    }
}
