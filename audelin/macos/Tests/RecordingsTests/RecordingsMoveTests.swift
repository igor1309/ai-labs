import Foundation
import Recordings
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1)))
struct RecordingsMoveTests {
    @Test func asksWithTheFolderCountAndSizeAndCancelsWithoutMoving() {
        let idle = makeState()
        assert(idle, .chooseFolder(destination), delivers: .prepareMove(destination)) {
            $0.phase = .countingMove; $0.move = rendered(.init(destination: destination))
        }
        let counting = makeState { $0.phase = .countingMove; $0.move = .init(destination: destination) }
        assert(counting, .movePrepared([newer, older]), delivers: nil) {
            $0.phase = .askingMove; $0.move = plan()
        }
        let asking = makeState { $0.phase = .askingMove; $0.move = plan() }
        assert(asking, .cancelMove, delivers: nil) { $0.phase = .idle; $0.move = nil }
        assert(idle, .chooseFolder(source), delivers: nil)
        assert(counting, .chooseFolder(destination), delivers: nil)
        assert(counting, .movePreparationFailed("disk"), delivers: nil) {
            $0.phase = .countFailed; $0.failure = .init(id: nil, reason: "disk")
        }
        let failed = makeState { $0.phase = .countFailed; $0.move = .init(destination: destination); $0.failure = .init(id: nil, reason: "disk") }
        assert(failed, .retryMove, delivers: .prepareMove(destination)) { $0.phase = .countingMove; $0.failure = nil }
        assert(failed, .confirmMove, delivers: nil)
        assert(failed, .cancelMove, delivers: nil) { $0.phase = .idle; $0.move = nil; $0.failure = nil }
    }

    @Test func confirmsReservesAndMovesOldestFirstBeforeStoringAndRefreshing() {
        let asking = makeState { $0.phase = .askingMove; $0.move = plan() }
        assert(asking, .confirmMove, delivers: .reserveMove) { $0.phase = .reservingMove; $0.callsFolderAvailable = false }
        let reserving = makeState { $0.phase = .reservingMove; $0.move = plan(); $0.callsFolderAvailable = false }
        assert(reserving, .moveReserved(true), delivers: .prepareMove(destination)) { $0.phase = .preparingMove }
        let preparing = makeState { $0.phase = .preparingMove; $0.move = plan(); $0.callsFolderAvailable = false }
        assert(preparing, .movePrepared([newer, older]), delivers: .moveCall(id: older.id, to: destination)) { $0.phase = .moving }
        let moving = makeState { $0.phase = .moving; $0.move = plan(); $0.callsFolderAvailable = false }
        assert(moving, .callMoved(id: older.id, bytes: 3), delivers: .moveCall(id: newer.id, to: destination)) { $0.move = plan(completed: [older]) }
        let last = makeState { $0.phase = .moving; $0.move = plan(completed: [older]); $0.callsFolderAvailable = false }
        assert(last, .callMoved(id: newer.id, bytes: 7), delivers: .storeFolder(destination)) {
            $0.phase = .storingFolder; $0.move = plan(completed: [older, newer])
        }
        let storing = makeState { $0.phase = .storingFolder; $0.move = plan(completed: [older, newer]); $0.callsFolderAvailable = false }
        assert(storing, .folderStored, delivers: .releaseMove) { $0.phase = .releasingMove; $0.callsFolder = destination }
        let releasing = makeState { $0.phase = .releasingMove; $0.move = plan(completed: [older, newer]); $0.callsFolderAvailable = false; $0.callsFolder = destination }
        assert(releasing, .moveReleased, delivers: .list) { $0.phase = .idle; $0.move = nil; $0.callsFolderAvailable = true; $0.isListing = true }
        assert(moving, .callMoved(id: newer.id, bytes: 7), delivers: nil)
        assert(moving, .folderStored, delivers: nil)
    }

    @Test func failedMoveKeepsTheOldSettingAndRetryIncludesOnlyRemainingAndNewCalls() {
        let moving = makeState { $0.phase = .moving; $0.move = plan(completed: [older]); $0.callsFolderAvailable = false }
        assert(moving, .callMoveFailed(id: newer.id, reason: "full"), delivers: .releaseMove) {
            $0.phase = .releasingMove; $0.failure = .init(id: newer.id, reason: "full")
        }
        let releasing = makeState { $0.phase = .releasingMove; $0.move = plan(completed: [older]); $0.callsFolderAvailable = false; $0.failure = .init(id: newer.id, reason: "full") }
        assert(releasing, .clearFailure, delivers: nil)
        assert(releasing, .moveReleased, delivers: .list) { $0.phase = .failedMove; $0.callsFolderAvailable = true; $0.isListing = true }
        let failed = makeState { $0.phase = .failedMove; $0.move = plan(completed: [older]); $0.failure = .init(id: newer.id, reason: "full") }
        assert(failed, .retryMove, delivers: .reserveMove) { $0.phase = .reservingMove; $0.callsFolderAvailable = false; $0.failure = nil }
        assert(failed, .cancelMove, delivers: nil) { $0.phase = .idle; $0.move = nil; $0.failure = nil }
        let preparing = makeState { $0.phase = .preparingMove; $0.move = plan(completed: [older]); $0.callsFolderAvailable = false }
        let fresh = MoveCall(id: "C", title: "New recording", bytes: 12)
        assert(preparing, .movePrepared([fresh, older, newer]), delivers: .moveCall(id: newer.id, to: destination)) {
            $0.phase = .moving
            $0.move?.remaining = [newer, fresh]; $0.move?.totalCalls = 3; $0.move?.totalBytes = 22
            $0.move?.progress = 1.0 / 3.0; $0.move = rendered($0.move!)
        }
        assert(preparing, .movePreparationFailed("read failed"), delivers: .releaseMove) {
            $0.phase = .releasingMove; $0.failure = .init(id: nil, reason: "read failed")
        }
    }

    @Test func emptyMoveAndStoreFailureRetryTheStoreWithoutMovingCompletedCalls() {
        let preparing = makeState { $0.phase = .preparingMove; $0.move = .init(destination: destination); $0.callsFolderAvailable = false }
        assert(preparing, .movePrepared([]), delivers: .storeFolder(destination)) { $0.phase = .storingFolder; $0.move = rendered(.init(destination: destination)) }
        let storing = makeState { $0.phase = .storingFolder; $0.move = plan(completed: [older, newer]); $0.callsFolderAvailable = false }
        assert(storing, .folderStoreFailed("preferences"), delivers: .releaseMove) { $0.phase = .releasingMove; $0.failure = .init(id: nil, reason: "preferences") }
        let retrying = makeState { $0.phase = .preparingMove; $0.move = plan(completed: [older, newer]); $0.callsFolderAvailable = false }
        assert(retrying, .movePrepared([newer, older]), delivers: .storeFolder(destination)) { $0.phase = .storingFolder }
    }

    @Test func recordingRefusesBothTheChoiceAndALateConfirmationAndReservationCanRefuse() {
        let recording = makeState { $0.recordingID = "A" }
        assert(recording, .chooseFolder(destination), delivers: nil) { $0.phase = .refusedMove }
        let refused = makeState { $0.recordingID = "A"; $0.phase = .refusedMove }
        assert(refused, .recordingChanged(nil), delivers: nil) { $0.recordingID = nil; $0.phase = .idle }
        let asking = makeState { $0.recordingID = "A"; $0.phase = .askingMove; $0.move = plan() }
        assert(asking, .confirmMove, delivers: nil) { $0.phase = .refusedMove }
        let reserving = makeState { $0.phase = .reservingMove; $0.move = plan(); $0.callsFolderAvailable = false }
        assert(reserving, .moveReserved(false), delivers: nil) { $0.phase = .refusedMove; $0.callsFolderAvailable = true }
    }

    @Test(arguments: [RecordingsState.Phase.renaming("A"), .deleting("B"), .countingMove, .reservingMove, .preparingMove, .moving, .storingFolder, .releasingMove])
    func everyRunningActionIgnoresOtherActions(phase: RecordingsState.Phase) {
        let state = makeState { $0.phase = phase; $0.move = plan() }
        for event: RecordingsEvent in [.chooseFolder(destination), .rename(id: "B", title: "title"), .askDelete("B"), .confirmDelete, .confirmMove, .retryMove, .cancelMove, .clearFailure, .refresh] {
            assert(state, event, delivers: nil)
        }
    }

    @Test func formattingIsInjectedAndUsedOnlyWhenMoveValuesChange() {
        let calls = Mutex<[CallsFolderMove]>([])
        let stub = MoveText(title: "title", body: "body", detail: "detail", moved: "moved")
        let reducer = RecordingsReducer(failureMessage: { _, _ in "" }, moveText: { move in calls.withLock { $0.append(move) }; return stub })
        #expect(calls.withLock { $0 }.isEmpty)
        let idle = makeState()
        assert(idle, .cancelMove, delivers: nil, using: reducer)
        #expect(calls.withLock { $0 }.isEmpty)
        assert(idle, .chooseFolder(destination), delivers: .prepareMove(destination), using: reducer) {
            $0.phase = .countingMove; $0.move = .init(destination: destination, text: stub)
        }
        #expect(calls.withLock { $0 } == [.init(destination: destination)])
        let counting = makeState { $0.phase = .countingMove; $0.move = .init(destination: destination) }
        assert(counting, .movePrepared([newer, older]), delivers: nil, using: reducer) {
            $0.phase = .askingMove; var move = plan(); move.text = stub; $0.move = move
        }
        var input = plan(); input.text = .init(title: "", body: "", detail: "", moved: "")
        #expect(calls.withLock { $0 }.last == input)
        let moving = makeState { $0.phase = .moving; $0.move = plan(); $0.move?.text = stub; $0.callsFolderAvailable = false }
        assert(moving, .callMoved(id: older.id, bytes: 3), delivers: .moveCall(id: newer.id, to: destination), using: reducer) {
            var move = plan(completed: [older]); move.text = stub; $0.move = move
        }
        var progressed = plan(completed: [older]); progressed.text = stub
        #expect(calls.withLock { $0 }.last == progressed)
        let count = calls.withLock { $0.count }
        assert(moving, .callMoved(id: "stale", bytes: 3), delivers: nil, using: reducer)
        #expect(calls.withLock { $0.count } == count)
    }

    @Test func stoppingDrainsAnAlreadyAcceptedMoveAndRejectsNewActions() {
        let moving = makeState { $0.phase = .moving; $0.move = plan(completed: [older]); $0.callsFolderAvailable = false }
        assert(moving, .stopActions, delivers: nil) { $0.stopping = true }
        let stopped = makeState { $0.stopping = true }
        assert(stopped, .chooseFolder(destination), delivers: nil)
        assert(stopped, .rename(id: "A", title: "title"), delivers: nil)
        let asking = makeState { $0.stopping = true; $0.phase = .askingMove; $0.move = plan() }
        assert(asking, .confirmMove, delivers: nil)
        let deleting = makeState { $0.stopping = true; $0.phase = .askingDelete("A") }
        assert(deleting, .confirmDelete, delivers: nil)
        let draining = makeState { $0.stopping = true; $0.phase = .moving; $0.move = plan(completed: [older]); $0.callsFolderAvailable = false }
        assert(draining, .callMoved(id: newer.id, bytes: 7), delivers: .storeFolder(destination)) {
            $0.phase = .storingFolder; $0.move = plan(completed: [older, newer])
        }
    }

    @Test(arguments: handlerCases)
    fileprivate func handlersDeliverOnlyTheSpysResult(_ test: HandlerCase) async {
        let spy = MoveSpy()
        let handler = RecordingsEffectHandler(calls: spy,
            reserve: { if case let .reserved(value) = try? await spy.request(.reserveMove) { return value }; return false },
            release: { _ = try? await spy.request(.releaseMove) },
            storeFolder: { _ = try await spy.request(.storeFolder($0)) },
            describe: { $0.localizedDescription })
        await expect(handler, with: test.effect, toDeliver: test.event, on: { await spy.complete(test.answer) })
        #expect(await spy.received == [test.effect])
    }
}

private let source = URL(fileURLWithPath: "/source")
private let destination = URL(fileURLWithPath: "/destination")
private let older = MoveCall(id: "A", title: "Oldest", bytes: 3)
private let newer = MoveCall(id: "B", title: "Newest", bytes: 7)
private func rendered(_ given: CallsFolderMove) -> CallsFolderMove { var move = given; move.text = stubMoveText(move); return move }
private func plan(completed: [MoveCall] = []) -> CallsFolderMove {
    rendered(.init(destination: destination, remaining: [older, newer].filter { !completed.contains($0) }, completed: completed,
                   totalCalls: 2, totalBytes: 10, movedBytes: completed.reduce(0) { $0 + $1.bytes }, progress: Double(completed.count) / 2))
}
private func makeState(_ change: (inout RecordingsState) -> Void = { _ in }) -> RecordingsState {
    var state = RecordingsState(callsFolder: source); change(&state); return state
}
private func assert(_ state: RecordingsState, _ event: RecordingsEvent, delivers effect: RecordingsEffect?,
                    using reducer: RecordingsReducer? = nil, sourceLocation: SourceLocation = #_sourceLocation,
                    _ change: (inout RecordingsState) -> Void = { _ in }) {
    var expected = state; change(&expected)
    let result = (reducer ?? defaultReducer).reduce(state, event)
    #expect(result.0 == expected, sourceLocation: sourceLocation)
    #expect(result.1 == effect, sourceLocation: sourceLocation)
}
private struct MoveError: LocalizedError { var errorDescription: String? { "disk" } }
private enum Answer: Sendable { case calls([MoveCall]), bytes(Int64), reserved(Bool), done }
private struct HandlerCase: Sendable {
    let effect: RecordingsEffect
    let event: RecordingsEvent
    let answer: Result<Answer, any Error>
}
private let handlerCases: [HandlerCase] = [
    .init(effect: .prepareMove(destination), event: .movePrepared([older, newer]), answer: .success(.calls([older, newer]))),
    .init(effect: .prepareMove(destination), event: .movePreparationFailed("disk"), answer: .failure(MoveError())),
    .init(effect: .reserveMove, event: .moveReserved(true), answer: .success(.reserved(true))),
    .init(effect: .reserveMove, event: .moveReserved(false), answer: .success(.reserved(false))),
    .init(effect: .releaseMove, event: .moveReleased, answer: .success(.done)),
    .init(effect: .moveCall(id: older.id, to: destination), event: .callMoved(id: older.id, bytes: 3), answer: .success(.bytes(3))),
    .init(effect: .moveCall(id: older.id, to: destination), event: .callMoveFailed(id: older.id, reason: "disk"), answer: .failure(MoveError())),
    .init(effect: .storeFolder(destination), event: .folderStored, answer: .success(.done)),
    .init(effect: .storeFolder(destination), event: .folderStoreFailed("disk"), answer: .failure(MoveError()))
]
private actor MoveSpy: RecordingsCalls {
    private(set) var received: [RecordingsEffect] = []
    private var answer: CheckedContinuation<Answer, any Error>?
    private var started: CheckedContinuation<Void, Never>?
    func request(_ effect: RecordingsEffect) async throws -> Answer {
        received.append(effect)
        return try await withCheckedThrowingContinuation { answer = $0; started?.resume(); started = nil }
    }
    func complete(_ result: Result<Answer, any Error>) async {
        if answer == nil { await withCheckedContinuation { started = $0 } }
        answer?.resume(with: result); answer = nil
    }
    func prepareMove(to destination: URL) async throws -> [MoveCall] { if case let .calls(value) = try await request(.prepareMove(destination)) { return value }; throw MoveError() }
    func move(id: String, to destination: URL) async throws -> Int64 { if case let .bytes(value) = try await request(.moveCall(id: id, to: destination)) { return value }; throw MoveError() }
    func list() async throws -> [RecordedCall] { throw MoveError() }
    func rename(id: String, title: String) async throws { throw MoveError() }
    func delete(id: String) async throws { throw MoveError() }
}
private func expect(_ sut: RecordingsEffectHandler, with effect: RecordingsEffect, toDeliver expected: RecordingsEvent,
                    on action: @escaping @Sendable () async -> Void, sourceLocation: SourceLocation = #_sourceLocation) async {
    let result = Task { var events: [RecordingsEvent] = []; for await event in sut.handle(effect) { events.append(event) }; return events }
    await action()
    #expect(await result.value == [expected], sourceLocation: sourceLocation)
}
