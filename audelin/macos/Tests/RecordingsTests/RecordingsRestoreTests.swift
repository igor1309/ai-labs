import Foundation
import Recordings
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1)))
struct RecordingsRestoreTests {
    @Test func S1_offeredRestoreAsksCallsAndShowsRestoring() async {
        let messages = RestoreMessageSpy()
        let reducer = messages.reducer
        #expect(messages.received.isEmpty)
        await assert(makeReady { $0.failure = .init(id: "A", reason: "old"); $0.selectedCallID = "B" },
                     .restorePreviousTranscript("A"), delivers: .restorePreviousTranscript("A"), reducer: reducer) {
            $0.phase = .restoring("A"); $0.transcriptRequest += 1; $0.selectedCallID = "A"; $0.failure = nil
            setOffers(&$0, .actionUnderWay)
        }
        #expect(messages.received == [.actionUnderWay, .actionUnderWay])
        await assert(makeRestoring(), .clearFailure, delivers: nil, reducer: reducer)
        #expect(messages.received == [.actionUnderWay, .actionUnderWay])
    }

    @Test func S2_restoredListsFreshCallsSelectsAndPublishesChange() async {
        await assert(makeRestoring { $0.failure = .init(id: "B", reason: "refused"); $0.selectedCallID = "B" },
                     .transcriptRestored("A"), delivers: .list(request: 8)) {
            $0.phase = .idle; $0.selectedCallID = "A"; $0.failure = nil
            $0.transcriptChanged = .init(id: "A", request: 4); $0.isListing = true; $0.listRequest = 8
        }
        await assert(makeReady {
            $0.transcriptRequest = 4; $0.selectedCallID = "A"; $0.transcriptChanged = .init(id: "A", request: 4)
            $0.isListing = true; $0.listRequest = 8; setOffers(&$0, .actionUnderWay)
        }, .listed(request: 8, freshCalls()), delivers: nil) {
            $0.calls = freshCalls(); $0.isListing = false; setOffers(&$0, nil)
        }
    }

    @Test func S3_failedRestoreKeepsReasonAndSelectionWithoutListing() async {
        await assert(makeRestoring { $0.selectedCallID = "B" },
                     .transcriptRestoreFailed(id: "A", reason: "restore failed"), delivers: nil) {
            $0.phase = .idle; $0.selectedCallID = "A"; $0.failure = .init(id: "A", reason: "restore failed", kind: .transcriptRestore)
            setOffers(&$0, nil)
        }
        let calls = RestoreCallsSpy(), descriptions = Mutex<[RestoreFailure]>([])
        let handler = makeHandler(calls, describe: { error in
            if let error = error as? RestoreFailure { descriptions.withLock { $0.append(error) } }
            else { Issue.record("Unexpected error") }
            return "restore failed"
        })
        await expect(handler, with: .restorePreviousTranscript("A"), toDeliver: .transcriptRestoreFailed(id: "A", reason: "restore failed"), on: {
            await calls.complete(.failure(.disk))
        })
        #expect(await calls.received == [.restorePreviousTranscript("A")])
        #expect(descriptions.withLock { $0 } == [.disk])
    }

    @Test func S4_restoringRefusesEveryOtherActionWithItsReason() async {
        let requests: [(RecordingsEvent, String?)] = [
            (.rename(id: "A", title: "New"), "A"), (.rename(id: "B", title: "New"), "B"),
            (.askDelete("A"), "A"), (.askDelete("B"), "B"), (.confirmDelete, nil),
            (.enterMergeMode, nil), (.confirmMerge, nil), (.mergeAnyway, nil),
            (.chooseFolder(URL(fileURLWithPath: "/new")), nil), (.confirmMove, nil), (.retryMove, nil),
            (.makeTranscriptAgain("A"), "A"), (.makeTranscriptAgain("B"), "B"),
            (.restorePreviousTranscript("A"), "A"), (.restorePreviousTranscript("B"), "B")
        ]
        for (event, id) in requests {
            let messages = RestoreMessageSpy()
            await assert(makeRestoring(), event, delivers: nil, reducer: messages.reducer) {
                $0.failure = .init(id: id, reason: "restore busy")
            }
            #expect(messages.received == [.actionUnderWay])
        }
    }

    @Test func restoreRechecksAvailabilityRatherThanTheOldOffer() async {
        let unavailable: [(RecordingsState, TranscriptRefusal)] = [
            (makeReady { $0.mergeAvailable = false; setOffers(&$0, .notIdle) }, .notIdle),
            (makeReady { $0.recordingID = "B"; setOffers(&$0, .notIdle) }, .notIdle),
            (makeReady { $0.isListing = true; setOffers(&$0, .actionUnderWay) }, .actionUnderWay),
            (makeReady { $0.stopping = true; $0.stopped = true; setOffers(&$0, .actionUnderWay) }, .actionUnderWay),
            (makeReady { $0.tagsSave = .init(request: 2, id: "A", tags: []); setOffers(&$0, .actionUnderWay) }, .actionUnderWay),
            (makeReady { $0.callsFolderAvailable = false; setOffers(&$0, .actionUnderWay) }, .actionUnderWay),
            (makeReady {
                $0.calls = [makeCall(previous: false)]
                $0.transcriptOffers["A"]?.restore = .unavailable(.noPreviousTranscript, message: "restore busy")
            }, .noPreviousTranscript)
        ]
        for (state, refusal) in unavailable {
            let messages = RestoreMessageSpy()
            await assert(state, .restorePreviousTranscript("A"), delivers: nil, reducer: messages.reducer) {
                $0.failure = .init(id: "A", reason: "restore busy")
            }
            #expect(messages.received == [refusal])
        }
        for phase: RecordingsState.Phase in [.renaming("B"), .deleting("B"), .askingDelete("B"), .merging,
                                            .warnedFarApart, .runningMerge, .countingMove, .askingMove, .reservingMove,
                                            .preparingMove, .moving, .storingFolder, .releasingMove, .failedMove] {
            let messages = RestoreMessageSpy()
            await assert(makeReady { $0.phase = phase; setOffers(&$0, .actionUnderWay) },
                         .restorePreviousTranscript("A"), delivers: nil, reducer: messages.reducer) {
                $0.failure = .init(id: "A", reason: "restore busy")
            }
            #expect(messages.received == [.actionUnderWay])
        }
        let messages = RestoreMessageSpy()
        await assert(makeReady(), .restorePreviousTranscript("missing"), delivers: nil, reducer: messages.reducer) {
            $0.failure = .init(id: "missing", reason: "restore busy")
        }
        #expect(messages.received == [.callNotFound])
    }

    @Test func missingAudioDoesNotPreventRestoring() async {
        await assert(makeReady {
            $0.calls = [makeCall(missing: [.init(id: "A", track: .call)])]
            $0.transcriptOffers["A"]?.run = .unavailable(.missingTracks([.init(id: "A", track: .call)]), message: "restore busy")
        }, .restorePreviousTranscript("A"), delivers: .restorePreviousTranscript("A")) {
            $0.phase = .restoring("A"); $0.transcriptRequest += 1; $0.selectedCallID = "A"
            $0.transcriptOffers["A"]?.restore = .unavailable(.actionUnderWay, message: "restore busy")
        }
    }

    @Test func shutdownWaitsForRestoreSuccessOrFailure() async {
        await assert(makeRestoring(), .stopActions, delivers: nil) { $0.stopping = true }
        let stopping = makeRestoring { $0.stopping = true }
        await assert(stopping, .stopActions, delivers: nil)
        await assert(stopping, .transcriptRestored("A"), delivers: .list(request: 8)) {
            $0.phase = .idle; $0.stopped = true; $0.transcriptChanged = .init(id: "A", request: 4)
            $0.isListing = true; $0.listRequest = 8
        }
        await assert(stopping, .transcriptRestoreFailed(id: "A", reason: "failed"), delivers: nil) {
            $0.phase = .idle; $0.stopped = true; $0.failure = .init(id: "A", reason: "failed", kind: .transcriptRestore)
        }
    }

    @Test func unrelatedOrDuplicateOutcomesChangeNothing() async {
        for event: RecordingsEvent in [.transcriptRestored("B"), .transcriptRestoreFailed(id: "B", reason: "old")] {
            await assert(makeRestoring(), event, delivers: nil)
        }
        for event: RecordingsEvent in [.transcriptRestored("A"), .transcriptRestoreFailed(id: "A", reason: "old")] {
            await assert(makeReady { $0.transcriptChanged = .init(id: "A", request: 4) }, event, delivers: nil)
        }
    }

    @Test func anotherRestoreHasADistinctTranscriptChange() async {
        await assert(makeReady { $0.transcriptRequest = 4; $0.transcriptChanged = .init(id: "A", request: 4) },
                     .restorePreviousTranscript("A"), delivers: .restorePreviousTranscript("A")) {
            $0.phase = .restoring("A"); $0.transcriptRequest = 5; $0.selectedCallID = "A"; setOffers(&$0, .actionUnderWay)
        }
        await assert(makeRestoring { $0.transcriptRequest = 5; $0.transcriptChanged = .init(id: "A", request: 4) },
                     .transcriptRestored("A"), delivers: .list(request: 8)) {
            $0.phase = .idle; $0.transcriptChanged = .init(id: "A", request: 5); $0.isListing = true; $0.listRequest = 8
        }
    }
}

private func makeCall(_ id: String = "A", title: String = "Before restore", previous: Bool = true,
                      missing: [MissingRecordingTrack] = []) -> RecordedCall {
    .init(id: id, title: title, start: .distantPast, duration: 60, hasPreviousTranscript: previous, missingTracks: missing)
}

private func freshCalls() -> [RecordedCall] { [makeCall("B", title: "New call"), makeCall(title: "Freshly restored")] }

private func makeReady(_ change: (inout RecordingsState) -> Void = { _ in }) -> RecordingsState {
    var state = RecordingsState(calls: [makeCall()], listRequest: 7, mergeAvailable: true,
                                transcriptOffers: ["A": .init(run: .available, restore: .available)], transcriptRequest: 3)
    change(&state)
    return state
}

private func makeRestoring(_ change: (inout RecordingsState) -> Void = { _ in }) -> RecordingsState {
    makeReady {
        $0.phase = .restoring("A"); $0.transcriptRequest = 4; $0.selectedCallID = "A"
        $0.transcriptChanged = .init(id: "A", request: 3); setOffers(&$0, .actionUnderWay); change(&$0)
    }
}

private func setOffers(_ state: inout RecordingsState, _ reason: TranscriptRefusal?) {
    let offer = reason.map { TranscriptOffer.unavailable($0, message: "restore busy") } ?? .available
    state.transcriptOffers = Dictionary(uniqueKeysWithValues: state.calls.map { ($0.id, .init(run: offer, restore: offer)) })
}

private final class RestoreMessageSpy: Sendable {
    private let storage = Mutex<[TranscriptRefusal]>([])
    var received: [TranscriptRefusal] { storage.withLock { $0 } }
    var reducer: RecordingsReducer {
        .init(failureMessage: { $0 + $1 }, moveText: stubMoveText, busyMessage: { Issue.record("Unexpected busy formatter"); return "busy" },
              transcriptMessage: { reason in self.storage.withLock { $0.append(reason) }; return "restore busy" })
    }
}

private func assert(_ state: RecordingsState, _ event: RecordingsEvent, delivers effect: RecordingsEffect?,
                    reducer: RecordingsReducer? = nil, sourceLocation: SourceLocation = #_sourceLocation,
                    _ change: (inout RecordingsState) -> Void = { _ in }) async {
    var expected = state
    change(&expected)
    let result = (reducer ?? RestoreMessageSpy().reducer).reduce(state, event)
    #expect(result.0 == expected, sourceLocation: sourceLocation)
    #expect(result.1 == effect, sourceLocation: sourceLocation)
    if let effect = result.1 {
        let calls = RestoreCallsSpy(), handler = makeHandler(calls)
        switch effect {
        case let .restorePreviousTranscript(id):
            await expect(handler, with: effect, toDeliver: .transcriptRestored(id), on: { await calls.complete(.success([])) }, sourceLocation: sourceLocation)
        case let .list(request):
            await expect(handler, with: effect, toDeliver: .listed(request: request, freshCalls()), on: { await calls.complete(.success(freshCalls())) }, sourceLocation: sourceLocation)
        default: Issue.record("Unexpected effect", sourceLocation: sourceLocation)
        }
        #expect(await calls.received == [effect], sourceLocation: sourceLocation)
    }
}

private enum RestoreFailure: Error { case disk }

private actor RestoreCallsSpy: RecordingsCalls {
    private(set) var received: [RecordingsEffect] = []
    private var answer: CheckedContinuation<[RecordedCall], any Error>?
    private var started: CheckedContinuation<Void, Never>?
    private func request(_ effect: RecordingsEffect) async throws -> [RecordedCall] {
        received.append(effect)
        return try await withCheckedThrowingContinuation { answer = $0; started?.resume(); started = nil }
    }
    func complete(_ result: Result<[RecordedCall], RestoreFailure>) async {
        if answer == nil { await withCheckedContinuation { started = $0 } }
        answer?.resume(with: result.mapError { $0 as any Error }); answer = nil
    }
    func restorePreviousTranscript(id: String) async throws { _ = try await request(.restorePreviousTranscript(id)) }
    func list() async throws -> [RecordedCall] { try await request(.list(request: 8)) }
    func rename(id: String, title: String) { Issue.record("Unexpected rename") }
    func delete(id: String) { Issue.record("Unexpected delete") }
    func prepareMove(to destination: URL) -> [MoveCall] { Issue.record("Unexpected move"); return [] }
    func move(id: String, to destination: URL) -> Int64 { Issue.record("Unexpected move"); return 0 }
    func merge(ids: [String]) -> String { Issue.record("Unexpected merge"); return "" }
    func setTags(id: String, tags: [String]) { Issue.record("Unexpected tags") }
}

private func makeHandler(_ calls: RestoreCallsSpy, describe: @escaping @Sendable (any Error) -> String = { _ in
    Issue.record("Unexpected error"); return "error"
}) -> RecordingsEffectHandler {
    .init(calls: calls, transcriptAgain: UnusedTranscriptPort(),
          reserve: { Issue.record("Unexpected reservation"); return nil }, release: { _ in Issue.record("Unexpected release") },
          storeFolder: { _ in Issue.record("Unexpected folder write") }, describe: describe)
}

private func expect(_ sut: RecordingsEffectHandler, with effect: RecordingsEffect, toDeliver event: RecordingsEvent,
                    on completion: @escaping @Sendable () async -> Void, sourceLocation: SourceLocation = #_sourceLocation) async {
    let output = Task {
        var events: [RecordingsEvent] = []
        for await event in sut.handle(effect) { events.append(event) }
        return events
    }
    await completion()
    #expect(await output.value == [event], sourceLocation: sourceLocation)
}
