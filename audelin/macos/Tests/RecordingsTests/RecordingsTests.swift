import Foundation
import Recordings
import Synchronization
import Testing

struct RecordingsTests {
    @Test func S1_renamingACall() async {
        let idle = makeState()
        let renaming = makeState { $0.phase = .renaming("A") }
        assert(idle, .rename(id: "A", title: "New"), delivers: .rename(id: "A", title: "New")) {
            $0.phase = .renaming("A")
        }
        assert(renaming, .renamed("A"), delivers: .list(request: 1)) {
            $0.phase = .idle
            $0.isListing = true; $0.listRequest = 1
        }
        let call = RecordedCall(id: "A", title: "New", start: .distantPast, duration: 5)
        let listing = makeState { $0.isListing = true }
        assert(listing, .listed(request: 0, [call]), delivers: nil) {
            $0.calls = [call]
            $0.transcriptOffers = unavailableTranscriptOffers([call])
            $0.isListing = false
        }
        let spy = CallsSpy()
        await expect(RecordingsEffectHandler(calls: spy, transcriptAgain: UnusedTranscriptPort(), reserve: { 1 }, release: { _ in }, storeFolder: { _ in }, describe: { _ in "disk" }), with: .rename(id: "A", title: "New"), toDeliver: .renamed("A"), on: { await spy.complete(.success([])) })
        #expect(await spy.received == [.rename(id: "A", title: "New")])
    }

    @Test func S2_aFailedRenameIsNamed() async {
        let renaming = makeState { $0.phase = .renaming("A") }
        assert(renaming, .renameFailed(id: "A", reason: "disk"), delivers: .list(request: 1)) {
            $0.phase = .idle
            $0.failure = .init(id: "A", reason: "disk")
            $0.isListing = true; $0.listRequest = 1
        }
        let spy = CallsSpy()
        await expect(RecordingsEffectHandler(calls: spy, transcriptAgain: UnusedTranscriptPort(), reserve: { 1 }, release: { _ in }, storeFolder: { _ in }, describe: { $0 is DiskFailure ? "disk" : "other" }), with: .rename(id: "A", title: "New"), toDeliver: .renameFailed(id: "A", reason: "disk"), on: { await spy.complete(.failure(DiskFailure())) })
    }

    @Test func S3_aDeleteWaitsForTheConfirm() {
        let idle = makeState()
        let asking = makeState { $0.phase = .askingDelete("A") }
        assert(idle, .askDelete("A"), delivers: nil) { $0.phase = .askingDelete("A") }
        assert(asking, .cancelDelete, delivers: nil) { $0.phase = .idle }
        assert(asking, .askDelete("B"), delivers: nil) { $0.phase = .askingDelete("B") }
        assert(idle, .confirmDelete, delivers: nil)
    }

    @Test func S4_aConfirmedDeleteRemovesTheCall() async {
        let asking = makeState { $0.phase = .askingDelete("A") }
        let deleting = makeState { $0.phase = .deleting("A") }
        assert(asking, .confirmDelete, delivers: .delete("A")) { $0.phase = .deleting("A") }
        assert(deleting, .deleted("A"), delivers: .list(request: 1)) {
            $0.phase = .idle
            $0.isListing = true; $0.listRequest = 1
        }
        assert(deleting, .deleteFailed(id: "A", reason: "disk"), delivers: .list(request: 1)) {
            $0.phase = .idle
            $0.failure = .init(id: "A", reason: "disk")
            $0.isListing = true; $0.listRequest = 1
        }
        for failed in [false, true] {
            let spy = CallsSpy()
            await expect(RecordingsEffectHandler(calls: spy, transcriptAgain: UnusedTranscriptPort(), reserve: { 1 }, release: { _ in }, storeFolder: { _ in }, describe: { _ in "disk" }), with: .delete("A"), toDeliver: failed ? .deleteFailed(id: "A", reason: "disk") : .deleted("A"), on: { await spy.complete(failed ? .failure(DiskFailure()) : .success([])) })
            #expect(await spy.received == [.delete("A")])
        }
    }

    @Test func S5_theCallBeingRecordedIsLeftAlone() {
        let active = makeState { $0.recordingID = "A" }
        let asking = makeState { $0.recordingID = "A"; $0.phase = .askingDelete("A") }
        assert(active, .rename(id: "A", title: "New"), delivers: nil)
        assert(active, .askDelete("A"), delivers: nil)
        assert(asking, .confirmDelete, delivers: nil)
        let askingB = makeState { $0.recordingID = "A"; $0.phase = .askingDelete("B") }
        assert(active, .askDelete("B"), delivers: nil) { $0.phase = .askingDelete("B") }
        assert(askingB, .confirmDelete, delivers: .delete("B")) { $0.phase = .deleting("B") }
        assert(active, .rename(id: "B", title: "New"), delivers: .rename(id: "B", title: "New")) {
            $0.phase = .renaming("B")
        }
        let before = makeState { $0.phase = .askingDelete("A") }
        assert(before, .recordingChanged("A"), delivers: nil) { $0.recordingID = "A" }
    }

    @Test func S6_oneActionAtATime() {
        let renaming = makeState { $0.phase = .renaming("A") }
        let deleting = makeState { $0.phase = .deleting("A") }
        let listing = makeState { $0.isListing = true }
        for busy in [renaming, deleting, listing] {
            for event: RecordingsEvent in [.rename(id: "B", title: "New"), .askDelete("B"), .confirmDelete, .refresh] {
                assert(busy, event, delivers: nil)
            }
        }
    }

    @Test func listingDeliversAdapterDataAndFailure() async {
        let call = RecordedCall(id: "A", title: "Zoom", start: .distantPast, duration: nil, tags: .known(["клиент"]))
        for failed in [false, true] {
            let spy = CallsSpy()
            await expect(RecordingsEffectHandler(calls: spy, transcriptAgain: UnusedTranscriptPort(), reserve: { 1 }, release: { _ in }, storeFolder: { _ in }, describe: { _ in "disk" }), with: .list(request: 4), toDeliver: failed ? .listFailed(request: 4, "disk") : .listed(request: 4, [call]), on: { await spy.complete(failed ? .failure(DiskFailure()) : .success([call])) })
            #expect(await spy.received == [.list(request: 0)])
        }
    }

    @Test func onlyTheAnswerToTheLatestListRequestApplies() {
        let tagged = RecordedCall(id: "A", title: "Zoom", start: .distantPast, duration: nil, tags: .known(["клиент"]))
        let unreadable = RecordedCall(id: "B", title: "Meet", start: .distantPast, duration: nil, tags: .unreadable)
        let listing = makeState { $0.isListing = true; $0.listRequest = 2 }
        assert(listing, .listed(request: 1, [tagged]), delivers: nil)
        assert(listing, .listFailed(request: 1, "denied"), delivers: nil)
        assert(listing, .listed(request: 2, [tagged, unreadable]), delivers: nil) {
            $0.calls = [tagged, unreadable]
            $0.transcriptOffers = unavailableTranscriptOffers([tagged, unreadable])
            $0.isListing = false
        }
    }

    @Test func aReloadAfterAnActionIsANewRequest() {
        let renaming = makeState { $0.phase = .renaming("A"); $0.isListing = true; $0.listRequest = 3 }
        assert(renaming, .renamed("A"), delivers: .list(request: 4)) {
            $0.phase = .idle
            $0.listRequest = 4
        }
    }

    @Test func S1_settingTagsSavesThemAndReloadsTheList() async {
        let idle = makeState { $0.listRequest = 2 }
        assert(idle, .setTags(request: 7, id: "A", tags: ["клиент", "банк"]), delivers: .setTags(request: 7, id: "A", tags: ["клиент", "банк"])) {
            $0.tagsSave = .init(request: 7, id: "A", tags: ["клиент", "банк"])
        }
        let saving = makeState { $0.listRequest = 2; $0.tagsSave = .init(request: 7, id: "A", tags: ["клиент"]) }
        assert(saving, .tagsSet(request: 7, id: "A"), delivers: .list(request: 3)) {
            $0.tagsSave = nil
            $0.tagsOutcome = .init(request: 7, id: "A", result: .saved)
            $0.isListing = true; $0.listRequest = 3
        }
        for failed in [false, true] {
            let spy = CallsSpy()
            await expect(RecordingsEffectHandler(calls: spy, transcriptAgain: UnusedTranscriptPort(), reserve: { 1 }, release: { _ in }, storeFolder: { _ in }, describe: { _ in "disk" }),
                         with: .setTags(request: 7, id: "A", tags: ["клиент"]),
                         toDeliver: failed ? .tagsSetFailed(request: 7, id: "A", reason: "disk") : .tagsSet(request: 7, id: "A"),
                         on: { await spy.complete(failed ? .failure(DiskFailure()) : .success([])) })
            #expect(await spy.received == [.setTags(request: 0, id: "A", tags: ["клиент"])])
        }
    }

    @Test func aFailedTagsSaveIsReportedWithItsRequest() {
        let saving = makeState { $0.tagsSave = .init(request: 7, id: "A", tags: ["клиент"]) }
        assert(saving, .tagsSetFailed(request: 7, id: "A", reason: "disk"), delivers: nil) {
            $0.tagsSave = nil
            $0.tagsOutcome = .init(request: 7, id: "A", result: .failed("disk"))
        }
    }

    @Test func anOutcomeOfAnotherRequestIsIgnored() {
        let saving = makeState { $0.tagsSave = .init(request: 7, id: "A", tags: ["клиент"]) }
        assert(saving, .tagsSet(request: 6, id: "A"), delivers: nil)
        assert(saving, .tagsSetFailed(request: 6, id: "A", reason: "disk"), delivers: nil)
    }

    @Test func aListRequestedBeforeASavedTagsWriteNeverApplies() {
        let call = RecordedCall(id: "A", title: "", start: .distantPast, duration: nil, tags: .known([]))
        let listingBeforeSave = makeState { $0.isListing = true; $0.listRequest = 2; $0.tagsSave = .init(request: 7, id: "A", tags: ["клиент"]) }
        assert(listingBeforeSave, .tagsSet(request: 7, id: "A"), delivers: .list(request: 3)) {
            $0.tagsSave = nil
            $0.tagsOutcome = .init(request: 7, id: "A", result: .saved)
            $0.listRequest = 3
        }
        let listingAfterSave = makeState { $0.isListing = true; $0.listRequest = 3; $0.tagsOutcome = .init(request: 7, id: "A", result: .saved) }
        assert(listingAfterSave, .listed(request: 2, [call]), delivers: nil)
    }

    @Test func tagsAreRefusedWhileAMoveOrMergeHoldsTheCallsOrAnotherSaveRuns() {
        let held: [RecordingsState] = [
            makeState { $0.phase = .moving; $0.moveToken = 1; $0.callsFolderAvailable = false },
            makeState { $0.callsFolderAvailable = false },
            makeState { $0.phase = .runningMerge },
            makeState { $0.stopping = true; $0.stopped = true },
            makeState { $0.tagsSave = .init(request: 1, id: "B", tags: []) },
        ]
        for state in held {
            assert(state, .setTags(request: 7, id: "A", tags: ["клиент"]), delivers: nil) {
                $0.tagsOutcome = .init(request: 7, id: "A", result: .failed("busy"))
            }
        }
    }

    @Test func stoppingWaitsForThePendingTagsSave() {
        let saving = makeState { $0.tagsSave = .init(request: 7, id: "A", tags: []) }
        assert(saving, .stopActions, delivers: nil) { $0.stopping = true }
        let stoppingSaving = makeState { $0.stopping = true; $0.tagsSave = .init(request: 7, id: "A", tags: []) }
        assert(stoppingSaving, .tagsSetFailed(request: 7, id: "A", reason: "disk"), delivers: nil) {
            $0.tagsSave = nil
            $0.tagsOutcome = .init(request: 7, id: "A", result: .failed("disk"))
            $0.stopped = true
        }
    }

    @Test func failureStaysAcrossTheReloadAndClearsAtTheNextAction() {
        let failed = makeState { $0.failure = .init(id: "A", reason: "disk") }
        let refreshing = makeState { $0.failure = .init(id: "A", reason: "disk"); $0.isListing = true }
        assert(refreshing, .listed(request: 0, []), delivers: nil) { $0.isListing = false }
        assert(refreshing, .listFailed(request: 0, "denied"), delivers: nil) {
            $0.isListing = false
            $0.failure = .init(id: "A", reason: "disk Не удалось обновить список: denied")
        }
        assert(failed, .clearFailure, delivers: nil) { $0.failure = nil }
        assert(failed, .askDelete("B"), delivers: nil) {
            $0.phase = .askingDelete("B")
            $0.failure = nil
        }
    }

    @Test func constructionDoesNotComposeFailure() {
        let spy = FailureMessageSpy(result: "unused")
        _ = RecordingsReducer(failureMessage: spy.compose, moveText: stubMoveText, busyMessage: { "busy" }, transcriptMessage: { _ in "transcript unavailable" })
        #expect(spy.calls == [])
    }

    @Test(arguments: [nil, "A"] as [String?])
    func refreshFailureUsesInjectedMessageAndKeepsFailureID(_ id: String?) {
        let spy = FailureMessageSpy(result: "composed message")
        let reducer = RecordingsReducer(failureMessage: spy.compose, moveText: stubMoveText, busyMessage: { "busy" }, transcriptMessage: { _ in "transcript unavailable" })
        let state = makeState {
            $0.isListing = true
            $0.failure = .init(id: id, reason: " prior failure ")
            $0.calls = [RecordedCall(id: "kept", title: "Kept", start: .distantPast, duration: 5)]
            $0.recordingID = "recording"
        }
        assert(state, .listFailed(request: 0, " refresh error "), delivers: nil, using: reducer) {
            $0.isListing = false
            $0.failure = .init(id: id, reason: "composed message")
        }
        #expect(spy.calls == [.init(prior: " prior failure ", refreshError: " refresh error ")])
    }

    @Test func listFailureWithoutPriorFailureDoesNotComposeMessage() {
        let spy = FailureMessageSpy(result: "unused")
        let state = makeState { $0.isListing = true }
        assert(state, .listFailed(request: 0, "denied"), delivers: nil, using: RecordingsReducer(failureMessage: spy.compose, moveText: stubMoveText, busyMessage: { "busy" }, transcriptMessage: { _ in "transcript unavailable" })) {
            $0.isListing = false
            $0.failure = .init(id: nil, reason: "denied")
        }
        #expect(spy.calls == [])
    }

    @Test func ignoredEventsDoNotComposeFailure() {
        let failed = makeState { $0.failure = .init(id: "A", reason: "prior") }
        let renaming = makeState { $0.phase = .renaming("A"); $0.failure = failed.failure }
        let deleting = makeState { $0.phase = .deleting("A"); $0.failure = failed.failure }
        let listing = makeState { $0.isListing = true; $0.failure = failed.failure }
        let active = makeState { $0.recordingID = "A"; $0.failure = failed.failure }
        let askingActive = makeState {
            $0.phase = .askingDelete("A"); $0.recordingID = "A"; $0.failure = failed.failure
        }
        let cases: [(RecordingsState, [RecordingsEvent])] = [
            (makeState(), [.clearFailure, .recordingChanged(nil), .listFailed(request: 0, "denied")]),
            (failed, [.listed(request: 0, []), .listFailed(request: 0, "denied"), .renamed("A"), .renameFailed(id: "A", reason: "disk"),
                      .cancelDelete, .confirmDelete, .deleted("A"), .deleteFailed(id: "A", reason: "disk")]),
            (renaming, [.rename(id: "B", title: "New"), .askDelete("B"), .confirmDelete, .cancelDelete,
                        .refresh, .renamed("B"), .renameFailed(id: "B", reason: "disk")]),
            (deleting, [.rename(id: "B", title: "New"), .askDelete("B"), .confirmDelete, .cancelDelete,
                        .refresh, .deleted("B"), .deleteFailed(id: "B", reason: "disk")]),
            (listing, [.rename(id: "B", title: "New"), .askDelete("B"), .confirmDelete, .refresh]),
            (active, [.rename(id: "A", title: "New"), .askDelete("A")]),
            (askingActive, [.confirmDelete, .refresh]),
        ]
        for (state, events) in cases {
            for event in events {
                let spy = FailureMessageSpy(result: "unused")
                assert(state, event, delivers: nil, using: RecordingsReducer(failureMessage: spy.compose, moveText: stubMoveText, busyMessage: { "busy" }, transcriptMessage: { _ in "transcript unavailable" }))
                #expect(spy.calls == [])
            }
        }
    }

    @Test func unrelatedTransitionsDoNotComposeFailure() {
        let spy = FailureMessageSpy(result: "unused")
        let reducer = RecordingsReducer(failureMessage: spy.compose, moveText: stubMoveText, busyMessage: { "busy" }, transcriptMessage: { _ in "transcript unavailable" })
        let failed = makeState { $0.failure = .init(id: "A", reason: "prior") }
        let asking = makeState { $0.phase = .askingDelete("A"); $0.failure = failed.failure }
        let renaming = makeState { $0.phase = .renaming("A"); $0.failure = failed.failure }
        let deleting = makeState { $0.phase = .deleting("A"); $0.failure = failed.failure }
        let listing = makeState { $0.isListing = true; $0.failure = failed.failure }
        let call = RecordedCall(id: "A", title: "New", start: .distantPast, duration: 5)
        assert(failed, .recordingChanged("B"), delivers: nil, using: reducer) { $0.recordingID = "B" }
        assert(failed, .clearFailure, delivers: nil, using: reducer) { $0.failure = nil }
        assert(failed, .refresh, delivers: .list(request: 1), using: reducer) {
            $0.isListing = true; $0.listRequest = 1
            $0.failure = nil
        }
        assert(listing, .listed(request: 0, [call]), delivers: nil, using: reducer) {
            $0.isListing = false
            $0.calls = [call]
            $0.transcriptOffers = unavailableTranscriptOffers([call])
        }
        assert(failed, .rename(id: "B", title: "New"), delivers: .rename(id: "B", title: "New"), using: reducer) {
            $0.phase = .renaming("B")
            $0.failure = nil
        }
        assert(renaming, .renamed("A"), delivers: .list(request: 1), using: reducer) {
            $0.phase = .idle
            $0.isListing = true; $0.listRequest = 1
        }
        assert(renaming, .renameFailed(id: "A", reason: "disk"), delivers: .list(request: 1), using: reducer) {
            $0.phase = .idle
            $0.failure = .init(id: "A", reason: "disk")
            $0.isListing = true; $0.listRequest = 1
        }
        assert(failed, .askDelete("B"), delivers: nil, using: reducer) {
            $0.phase = .askingDelete("B")
            $0.failure = nil
        }
        assert(asking, .cancelDelete, delivers: nil, using: reducer) { $0.phase = .idle }
        assert(asking, .confirmDelete, delivers: .delete("A"), using: reducer) {
            $0.phase = .deleting("A")
            $0.failure = nil
        }
        assert(deleting, .deleted("A"), delivers: .list(request: 1), using: reducer) {
            $0.phase = .idle
            $0.isListing = true; $0.listRequest = 1
        }
        assert(deleting, .deleteFailed(id: "A", reason: "disk"), delivers: .list(request: 1), using: reducer) {
            $0.phase = .idle
            $0.failure = .init(id: "A", reason: "disk")
            $0.isListing = true; $0.listRequest = 1
        }
        #expect(spy.calls == [])
    }
}

struct RecordingsMergeEffectTests {
    @Test func S5_theHandlerAsksThePortForTheCallsAndDeliversTheMergedCall() async {
        let spy = CallsSpy()
        let merged = RecordedCall(id: "A", title: "", start: .distantPast, duration: 60)
        await expect(RecordingsEffectHandler(calls: spy, transcriptAgain: UnusedTranscriptPort(), reserve: { 1 }, release: { _ in }, storeFolder: { _ in }, describe: { _ in "disk" }),
                     with: .merge(["A", "B"]), toDeliver: .merged("A"), on: { await spy.complete(.success([merged])) })
        #expect(await spy.received == [.merge(["A", "B"])])
    }

    @Test func S11_theHandlerDeliversWhyAMergeFailed() async {
        let spy = CallsSpy()
        await expect(RecordingsEffectHandler(calls: spy, transcriptAgain: UnusedTranscriptPort(), reserve: { 1 }, release: { _ in }, storeFolder: { _ in }, describe: { $0 is DiskFailure ? "disk" : "other" }),
                     with: .merge(["A", "B"]), toDeliver: .mergeFailed("disk"), on: { await spy.complete(.failure(DiskFailure())) })
    }
}

private func makeState(_ change: (inout RecordingsState) -> Void = { _ in }) -> RecordingsState {
    var state = RecordingsState()
    change(&state)
    state.transcriptOffers = unavailableTranscriptOffers(state.calls)
    return state
}

private func assert(
    _ state: RecordingsState, _ event: RecordingsEvent, delivers effect: RecordingsEffect?,
    using reducer: RecordingsReducer? = nil, sourceLocation: SourceLocation = #_sourceLocation,
    _ change: (inout RecordingsState) -> Void = { _ in }
) {
    var expected = state
    change(&expected)
    let result = (reducer ?? defaultReducer).reduce(state, event)
    #expect(result.0 == expected, sourceLocation: sourceLocation)
    #expect(result.1 == effect, sourceLocation: sourceLocation)
}

private final class FailureMessageSpy: Sendable {
    struct Call: Equatable, Sendable {
        let prior: String
        let refreshError: String
    }
    private let storage = Mutex<[Call]>([])
    private let result: String

    init(result: String) { self.result = result }
    var calls: [Call] { storage.withLock { $0 } }

    func compose(_ prior: String, _ refreshError: String) -> String {
        storage.withLock { $0.append(.init(prior: prior, refreshError: refreshError)) }
        return result
    }
}

private func expect(_ sut: RecordingsEffectHandler, with effect: RecordingsEffect, toDeliver expected: RecordingsEvent,
                    on action: @escaping @Sendable () async -> Void, sourceLocation: SourceLocation = #_sourceLocation) async {
    let output = Task { var events: [RecordingsEvent] = []; for await event in sut.handle(effect) { events.append(event) }; return events }
    await action()
    #expect(await output.value == [expected], sourceLocation: sourceLocation)
}
private struct DiskFailure: LocalizedError { var errorDescription: String? { "disk" } }
private actor CallsSpy: RecordingsCalls {
    private(set) var received: [RecordingsEffect] = []
    private var answer: CheckedContinuation<[RecordedCall], any Error>?
    private var started: CheckedContinuation<Void, Never>?

    private func call(_ effect: RecordingsEffect) async throws -> [RecordedCall] {
        received.append(effect)
        return try await withCheckedThrowingContinuation {
            answer = $0
            started?.resume(); started = nil
        }
    }
    func complete(_ result: Result<[RecordedCall], any Error>) async {
        if answer == nil { await withCheckedContinuation { started = $0 } }
        answer?.resume(with: result); answer = nil
    }
    func list() async throws -> [RecordedCall] { try await call(.list(request: 0)) }
    func rename(id: String, title: String) async throws { _ = try await call(.rename(id: id, title: title)) }
    func delete(id: String) async throws { _ = try await call(.delete(id)) }
    func prepareMove(to destination: URL) async throws -> [MoveCall] { _ = try await call(.prepareMove(destination)); return [] }
    func move(id: String, to destination: URL) async throws -> Int64 { _ = try await call(.moveCall(id: id, to: destination)); return 0 }
    /// Answers with the first listed call's id as the merged call.
    func merge(ids: [String]) async throws -> String { try await call(.merge(ids)).first?.id ?? "" }
    func setTags(id: String, tags: [String]) async throws { _ = try await call(.setTags(request: 0, id: id, tags: tags)) }
}

/// Move text that names every value it is given, so a test sees which move it came from.
@Sendable func stubMoveText(_ move: CallsFolderMove) -> MoveText {
    .init(title: "\(move.totalCalls) \(move.totalBytes)", body: move.destination.path,
          detail: "\(move.completed.count) \(move.movedBytes)", moved: "\(move.completed.count)/\(move.totalCalls)")
}

let defaultReducer = RecordingsReducer(failureMessage: { prior, refreshError in
    prior + " Не удалось обновить список: " + refreshError
}, moveText: stubMoveText, busyMessage: { "busy" }, transcriptMessage: { _ in "transcript unavailable" })

private func unavailableTranscriptOffers(_ calls: [RecordedCall]) -> [String: TranscriptOffers] {
    Dictionary(uniqueKeysWithValues: calls.map { ($0.id, TranscriptOffers(
        run: .unavailable(.notIdle, message: "transcript unavailable"),
        restore: .unavailable(.noPreviousTranscript, message: "transcript unavailable"))) })
}
