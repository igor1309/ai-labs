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
        assert(renaming, .renamed("A"), delivers: .list) {
            $0.phase = .idle
            $0.isListing = true
        }
        let call = RecordedCall(id: "A", title: "New", start: .distantPast, duration: 5)
        let listing = makeState { $0.isListing = true }
        assert(listing, .listed([call]), delivers: nil) {
            $0.calls = [call]
            $0.isListing = false
        }
        let spy = CallsSpy()
        await expect(RecordingsEffectHandler(calls: spy, reserve: { true }, release: {}, storeFolder: { _ in }, describe: { _ in "disk" }), with: .rename(id: "A", title: "New"), toDeliver: .renamed("A"), on: { await spy.complete(.success([])) })
        #expect(await spy.received == [.rename(id: "A", title: "New")])
    }

    @Test func S2_aFailedRenameIsNamed() async {
        let renaming = makeState { $0.phase = .renaming("A") }
        assert(renaming, .renameFailed(id: "A", reason: "disk"), delivers: nil) {
            $0.phase = .idle
            $0.failure = .init(id: "A", reason: "disk")
        }
        let spy = CallsSpy()
        await expect(RecordingsEffectHandler(calls: spy, reserve: { true }, release: {}, storeFolder: { _ in }, describe: { $0 is DiskFailure ? "disk" : "other" }), with: .rename(id: "A", title: "New"), toDeliver: .renameFailed(id: "A", reason: "disk"), on: { await spy.complete(.failure(DiskFailure())) })
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
        assert(deleting, .deleted("A"), delivers: .list) {
            $0.phase = .idle
            $0.isListing = true
        }
        assert(deleting, .deleteFailed(id: "A", reason: "disk"), delivers: nil) {
            $0.phase = .idle
            $0.failure = .init(id: "A", reason: "disk")
        }
        for failed in [false, true] {
            let spy = CallsSpy()
            await expect(RecordingsEffectHandler(calls: spy, reserve: { true }, release: {}, storeFolder: { _ in }, describe: { _ in "disk" }), with: .delete("A"), toDeliver: failed ? .deleteFailed(id: "A", reason: "disk") : .deleted("A"), on: { await spy.complete(failed ? .failure(DiskFailure()) : .success([])) })
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
        let call = RecordedCall(id: "A", title: "Zoom", start: .distantPast, duration: nil)
        for failed in [false, true] {
            let spy = CallsSpy()
            await expect(RecordingsEffectHandler(calls: spy, reserve: { true }, release: {}, storeFolder: { _ in }, describe: { _ in "disk" }), with: .list, toDeliver: failed ? .listFailed("disk") : .listed([call]), on: { await spy.complete(failed ? .failure(DiskFailure()) : .success([call])) })
            #expect(await spy.received == [.list])
        }
    }

    @Test func failureStaysAcrossTheResultRefreshAndClearsAtTheNextAction() {
        let failed = makeState { $0.failure = .init(id: "A", reason: "disk") }
        let refreshing = makeState { $0.failure = .init(id: "A", reason: "disk"); $0.isListing = true }
        assert(failed, .reloadAfterFailure, delivers: .list) { $0.isListing = true }
        assert(refreshing, .listed([]), delivers: nil) { $0.isListing = false }
        assert(refreshing, .listFailed("denied"), delivers: nil) {
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
        _ = RecordingsReducer(failureMessage: spy.compose, moveText: stubMoveText)
        #expect(spy.calls == [])
    }

    @Test(arguments: [nil, "A"] as [String?])
    func refreshFailureUsesInjectedMessageAndKeepsFailureID(_ id: String?) {
        let spy = FailureMessageSpy(result: "composed message")
        let reducer = RecordingsReducer(failureMessage: spy.compose, moveText: stubMoveText)
        let state = makeState {
            $0.isListing = true
            $0.failure = .init(id: id, reason: " prior failure ")
            $0.calls = [RecordedCall(id: "kept", title: "Kept", start: .distantPast, duration: 5)]
            $0.recordingID = "recording"
        }
        assert(state, .listFailed(" refresh error "), delivers: nil, using: reducer) {
            $0.isListing = false
            $0.failure = .init(id: id, reason: "composed message")
        }
        #expect(spy.calls == [.init(prior: " prior failure ", refreshError: " refresh error ")])
    }

    @Test func listFailureWithoutPriorFailureDoesNotComposeMessage() {
        let spy = FailureMessageSpy(result: "unused")
        let state = makeState { $0.isListing = true }
        assert(state, .listFailed("denied"), delivers: nil, using: RecordingsReducer(failureMessage: spy.compose, moveText: stubMoveText)) {
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
            (makeState(), [.clearFailure, .recordingChanged(nil), .listFailed("denied")]),
            (failed, [.listed([]), .listFailed("denied"), .renamed("A"), .renameFailed(id: "A", reason: "disk"),
                      .cancelDelete, .confirmDelete, .deleted("A"), .deleteFailed(id: "A", reason: "disk")]),
            (renaming, [.rename(id: "B", title: "New"), .askDelete("B"), .confirmDelete, .cancelDelete,
                        .refresh, .reloadAfterFailure, .renamed("B"), .renameFailed(id: "B", reason: "disk")]),
            (deleting, [.rename(id: "B", title: "New"), .askDelete("B"), .confirmDelete, .cancelDelete,
                        .refresh, .reloadAfterFailure, .deleted("B"), .deleteFailed(id: "B", reason: "disk")]),
            (listing, [.rename(id: "B", title: "New"), .askDelete("B"), .confirmDelete, .refresh, .reloadAfterFailure]),
            (active, [.rename(id: "A", title: "New"), .askDelete("A")]),
            (askingActive, [.confirmDelete, .refresh, .reloadAfterFailure]),
        ]
        for (state, events) in cases {
            for event in events {
                let spy = FailureMessageSpy(result: "unused")
                assert(state, event, delivers: nil, using: RecordingsReducer(failureMessage: spy.compose, moveText: stubMoveText))
                #expect(spy.calls == [])
            }
        }
    }

    @Test func unrelatedTransitionsDoNotComposeFailure() {
        let spy = FailureMessageSpy(result: "unused")
        let reducer = RecordingsReducer(failureMessage: spy.compose, moveText: stubMoveText)
        let failed = makeState { $0.failure = .init(id: "A", reason: "prior") }
        let asking = makeState { $0.phase = .askingDelete("A"); $0.failure = failed.failure }
        let renaming = makeState { $0.phase = .renaming("A"); $0.failure = failed.failure }
        let deleting = makeState { $0.phase = .deleting("A"); $0.failure = failed.failure }
        let listing = makeState { $0.isListing = true; $0.failure = failed.failure }
        let call = RecordedCall(id: "A", title: "New", start: .distantPast, duration: 5)
        assert(failed, .recordingChanged("B"), delivers: nil, using: reducer) { $0.recordingID = "B" }
        assert(failed, .clearFailure, delivers: nil, using: reducer) { $0.failure = nil }
        assert(failed, .refresh, delivers: .list, using: reducer) {
            $0.isListing = true
            $0.failure = nil
        }
        assert(failed, .reloadAfterFailure, delivers: .list, using: reducer) { $0.isListing = true }
        assert(listing, .listed([call]), delivers: nil, using: reducer) {
            $0.isListing = false
            $0.calls = [call]
        }
        assert(failed, .rename(id: "B", title: "New"), delivers: .rename(id: "B", title: "New"), using: reducer) {
            $0.phase = .renaming("B")
            $0.failure = nil
        }
        assert(renaming, .renamed("A"), delivers: .list, using: reducer) {
            $0.phase = .idle
            $0.isListing = true
        }
        assert(renaming, .renameFailed(id: "A", reason: "disk"), delivers: nil, using: reducer) {
            $0.phase = .idle
            $0.failure = .init(id: "A", reason: "disk")
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
        assert(deleting, .deleted("A"), delivers: .list, using: reducer) {
            $0.phase = .idle
            $0.isListing = true
        }
        assert(deleting, .deleteFailed(id: "A", reason: "disk"), delivers: nil, using: reducer) {
            $0.phase = .idle
            $0.failure = .init(id: "A", reason: "disk")
        }
        #expect(spy.calls == [])
    }
}

private func makeState(_ change: (inout RecordingsState) -> Void = { _ in }) -> RecordingsState {
    var state = RecordingsState()
    change(&state)
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
    func list() async throws -> [RecordedCall] { try await call(.list) }
    func rename(id: String, title: String) async throws { _ = try await call(.rename(id: id, title: title)) }
    func delete(id: String) async throws { _ = try await call(.delete(id)) }
    func prepareMove(to destination: URL) async throws -> [MoveCall] { _ = try await call(.prepareMove(destination)); return [] }
    func move(id: String, to destination: URL) async throws -> Int64 { _ = try await call(.moveCall(id: id, to: destination)); return 0 }
}

/// Move text that names every value it is given, so a test sees which move it came from.
@Sendable func stubMoveText(_ move: CallsFolderMove) -> MoveText {
    .init(title: "\(move.totalCalls) \(move.totalBytes)", body: move.destination.path,
          detail: "\(move.completed.count) \(move.movedBytes)", moved: "\(move.completed.count)/\(move.totalCalls)")
}

let defaultReducer = RecordingsReducer(failureMessage: { prior, refreshError in
    prior + " Не удалось обновить список: " + refreshError
}, moveText: stubMoveText)
