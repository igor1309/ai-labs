import Foundation
import Recordings
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1)))
struct RecordingsSplitTests {
    @Test func lateAnswersAndAnswersForAReplacedTranscriptAreIgnored() async throws {
        let (sut, spy) = makeReducer()
        let original = makeState()
        let first = sut.reduce(original, .splitSelectionChanged("A"))
        let second = sut.reduce(first.0, .splitSelectionChanged("B"))
        #expect(first.1 == .readSplitChoices(id: "A", request: 1))
        #expect(second.1 == .readSplitChoices(id: "B", request: 2))
        #expect(first.0.split.control == .unavailable(.checking, text: "Checking"))
        #expect(spy.messages == [.checking])

        let port = SplitSpy(choices: ["A": .success(choices("a")), "B": .success(choices("b"))],
                            split: .failure(.expiredTranscript))
        let handler = makeHandler(port)
        let answer = try await event(handler, try #require(second.1))
        let oldAnswer = try await event(handler, try #require(first.1))
        #expect(await port.reads == ["B", "A"])
        let current = sut.reduce(second.0, answer).0
        #expect(current.split.choices == .ready(choices("b")))
        #expect(current.split.control == .available)
        assert(sut, current, oldAnswer, delivers: nil)

        let changed = TranscriptChange(id: "B", request: 8)
        let replacing = makeState {
            $0.split = current.split
            $0.transcriptRun = .init(id: "B", request: 8)
        }
        let (listing, list) = sut.reduce(replacing, .transcriptReported(request: 8, .made))
        #expect(list == .list(request: 1))
        #expect(listing.transcriptChanged == changed)
        #expect(listing.split.choices == .unchecked)
        assert(sut, listing, answer, delivers: nil)
        let (checking, check) = sut.reduce(listing, .listed(request: 1, calls))
        #expect(check == .readSplitChoices(id: "B", request: 3))
        #expect(checking.split.choices == .checking)
        assert(sut, checking, answer, delivers: nil)
    }

    @Test func theDraftUsesTheAppLabelAndRechecksIdlenessOnConfirm() {
        let (sut, spy) = makeReducer()
        let ready = makeReady()
        assert(sut, ready, .openSplit, delivers: nil) {
            $0.phase = .choosingSplit
            $0.split.draft = .init(call: calls[0], cut: 12, firstTitle: "[Zoom] Product", secondTitle: "[Zoom] Product")
            $0.split.control = .unavailable(.busy, text: "Busy")
            $0.transcriptOffers = transcriptOffers("action")
        }

        let opened = sut.reduce(ready, .openSplit).0
        assert(sut, opened, .chooseSplit(6), delivers: nil) { $0.split.draft?.cut = 6 }
        assert(sut, opened, .editSplitTitle(.first, "First"), delivers: nil) { $0.split.draft?.firstTitle = "First" }
        assert(sut, opened, .editSplitTitle(.second, "Second"), delivers: nil) { $0.split.draft?.secondTitle = "Second" }

        let draft = makeDraft()
        let busy = sut.reduce(draft, .mergeAvailability(false)).0
        assert(sut, busy, .confirmSplit, delivers: nil) {
            $0.split.draft?.failure = "Busy"
        }
        #expect(spy.messages == [.busy, .busy, .busy])
        assert(sut, draft, .cancelSplit, delivers: nil) {
            $0.phase = .idle
            $0.split.draft = nil
            $0.split.control = .available
            $0.transcriptOffers = transcriptOffers()
        }
    }

    @Test func publishesBothPartsAndSelectsTheFirstOnlyAfterACompleteList() async throws {
        let (sut, _) = makeReducer()
        let draft = makeDraft()
        let running = makeRunning()
        let request = SplitRequest(id: "A", transcriptIdentity: "a", cut: 6, firstTitle: "First", secondTitle: "Second")
        assert(sut, draft, .confirmSplit, delivers: .split(request)) {
            $0.phase = .runningSplit
            $0.split.control = .unavailable(.finishing, text: "Finishing")
        }
        for action: RecordingsEvent in [.confirmSplit, .cancelSplit, .chooseSplit(12), .openSplit, .enterMergeMode] {
            assert(sut, running, action, delivers: nil)
        }

        let parts = SplitReplacement(first: "A", second: "C")
        let port = SplitSpy(choices: [:], split: .success(parts))
        let publishedCalls = [RecordedCall(id: "C", title: "Second", start: .distantFuture, duration: 34),
                              RecordedCall(id: "A", title: "First", start: .distantPast, duration: 6)]
        let handler = makeHandler(port, list: publishedCalls)
        let finished = try await event(handler, .split(request))
        #expect(finished == .splitFinished(.success(parts)))
        #expect(await port.requests == [request])
        let (publishing, list) = sut.reduce(running, finished)
        let replacement = RecordingsReplacement(removed: ["A"], published: ["A", "C"])
        #expect(publishing.phase == .publishingSplit && publishing.replacement == replacement)
        #expect(publishing.split.publishing == parts && publishing.split.listedReplacement == nil)
        #expect(list == .list(request: 1))

        let stale = sut.reduce(publishing, .listed(request: 0, publishedCalls)).0
        #expect(stale == publishing)
        let (failed, effect) = sut.reduce(publishing, .listFailed(request: 1, "Busy reading folder"))
        #expect(effect == nil && failed.phase == .publishingSplit && failed.replacement == replacement)
        #expect(failed.split.listedReplacement == nil)
        #expect(failed.split.publicationMessage == "Refresh: Busy reading folder")
        assert(sut, failed, .confirmSplit, delivers: nil)
        let (retry, freshList) = sut.reduce(failed, .refreshSplit)
        #expect(freshList == .list(request: 2))
        let listed = try await event(handler, try #require(freshList))
        assert(sut, retry, listed, delivers: .readSplitChoices(id: "A", request: 2)) {
            $0.phase = .idle
            $0.calls = publishedCalls
            $0.transcriptOffers = transcriptOffers(ids: ["C", "A"])
            $0.isListing = false
            $0.split.listedReplacement = parts
            $0.split.draft = nil
            $0.split.publishing = nil
            $0.split.request = 2
            $0.split.choices = .checking
            $0.split.control = .unavailable(.checking, text: "Checking")
        }
        let (incomplete, _) = sut.reduce(publishing, .listed(request: 1, Array(publishedCalls.dropFirst())))
        #expect(incomplete.phase == .publishingSplit && incomplete.split.refreshFailed)
        #expect(incomplete.calls == running.calls && incomplete.replacement == replacement)
        #expect(incomplete.split.listedReplacement == nil)
    }

    @Test func failuresKeepTheDraftAndExpiryRequiresAChoiceFromTheNewTranscript() async throws {
        let (sut, spy) = makeReducer()
        let running = makeRunning()
        let request = SplitRequest(id: "A", transcriptIdentity: "a", cut: 6, firstTitle: "First", secondTitle: "Second")
        let port = SplitSpy(choices: ["A": .success(choices("new"))], split: .failure(.expiredTranscript))
        let handler = makeHandler(port)
        let expired = try await event(handler, .split(request))
        let (checking, reread) = sut.reduce(running, expired)
        #expect(expired == .splitFinished(.failure(.refused(.expiredTranscript))))
        #expect(reread == .readSplitChoices(id: "A", request: 2))
        #expect(checking.split.draft?.cut == nil)
        #expect(checking.split.draft?.firstTitle == "First" && checking.split.draft?.secondTitle == "Second")
        #expect(checking.split.draft?.failure == "Expired")
        let fresh = try await event(handler, .readSplitChoices(id: "A", request: 2))
        let refreshed = sut.reduce(checking, fresh).0
        assert(sut, refreshed, .confirmSplit, delivers: nil)
        let chosen = sut.reduce(refreshed, .chooseSplit(12)).0
        #expect(sut.reduce(chosen, .confirmSplit).1 == .split(.init(id: "A", transcriptIdentity: "new", cut: 12,
                                                                  firstTitle: "First", secondTitle: "Second")))

        assert(sut, running, .splitFinished(.failure(.failed("Disk full"))), delivers: nil) {
            $0.phase = .choosingSplit
            $0.split.draft?.failure = "Disk full"
            $0.split.control = .unavailable(.busy, text: "Busy")
        }
        #expect(spy.messages.contains(.failed(.failed("Disk full"))))
    }

    @Test(arguments: [SplitRefusal.busy, .invalidTitle, .journalUnavailable])
    func aPrecommitRefusalKeepsTheBoundaryAndBothTitles(refusal: SplitRefusal) async throws {
        let (sut, spy) = makeReducer()
        let running = makeRunning()
        let request = SplitRequest(id: "A", transcriptIdentity: "a", cut: 6, firstTitle: "First", secondTitle: "Second")
        let port = SplitSpy(choices: [:], split: .failure(refusal))
        let answer = try await event(makeHandler(port), .split(request))
        let message = SplitMessage.failed(.refused(refusal))
        assert(sut, running, answer, delivers: nil) {
            $0.phase = .choosingSplit
            $0.split.draft?.failure = refusal == .busy ? "Busy" : "Refused"
            $0.split.control = .unavailable(.busy, text: "Busy")
        }
        #expect(spy.messages == [message, .busy])
        let draft = sut.reduce(running, answer).0
        #expect(sut.reduce(draft, .editSplitTitle(.second, "Edited")).0.split.draft?.secondTitle == "Edited")
    }

    @Test func aCommittedFailureKeepsProgressAndBlocksAnotherSplit() {
        let (sut, _) = makeReducer()
        let running = makeRunning()
        let committed = SplitRefusal.committed(.init(first: "A", second: "C"), reason: "Recovery needed")
        let recovered = sut.reduce(running, .splitFinished(.failure(.refused(committed)))).0
        #expect(recovered.phase == .publishingSplit)
        #expect(recovered.split.publicationMessage == "Recover: Recovery needed")
        #expect(recovered.replacement == nil && !recovered.split.refreshFailed)
        assert(sut, recovered, .confirmSplit, delivers: nil)
        assert(sut, recovered, .cancelSplit, delivers: nil)
        assert(sut, running, .stopActions, delivers: nil) { $0.stopping = true }
        assert(sut, recovered, .stopActions, delivers: nil) { $0.stopping = true; $0.stopped = true }
    }

    @Test(arguments: [SplitRefusal.inactiveFolder, .folderMove])
    func aReadRefusalIsShownOnTheControl(refusal: SplitRefusal) async throws {
        let (sut, spy) = makeReducer()
        let (checking, _) = sut.reduce(makeState(), .splitSelectionChanged("A"))
        let port = SplitSpy(choices: ["A": .failure(refusal)], split: .failure(refusal))
        let answer = try await event(makeHandler(port), .readSplitChoices(id: "A", request: 1))
        let reason = SplitMessage.failed(.refused(refusal))
        assert(sut, checking, answer, delivers: nil) {
            $0.split.choices = .failed(.refused(refusal))
            $0.split.control = .unavailable(reason, text: "Refused")
        }
        #expect(spy.messages == [.checking, reason])
    }

    @Test func anUnreadableTranscriptAndAnEmptyChoicesListGiveDifferentReasons() {
        let (sut, _) = makeReducer()
        let checking = sut.reduce(makeState(), .splitSelectionChanged("A")).0
        let error = SplitPortFailure.failed("Cannot read transcript")
        assert(sut, checking, .splitChoicesRead(id: "A", request: 1, .failure(error)), delivers: nil) {
            $0.split.choices = .failed(error)
            $0.split.control = .unavailable(.failed(error), text: "Cannot read transcript")
        }
        let empty = SplitChoices(transcriptIdentity: "one entry", choices: [])
        assert(sut, checking, .splitChoicesRead(id: "A", request: 1, .success(empty)), delivers: nil) {
            $0.split.choices = .ready(empty)
            $0.split.control = .unavailable(.noChoices, text: "No gap")
        }
    }
}

private let calls = [
    RecordedCall(id: "A", title: "[Zoom] Product", start: .distantPast, duration: 40),
    RecordedCall(id: "B", title: "Other", start: .distantPast, duration: 20),
]

private func choices(_ identity: String) -> SplitChoices {
    .init(transcriptIdentity: identity, choices: [
        .init(before: "Bye", after: "Hello", cut: 12, gap: 6, suggestsTransition: true, secondPartMinute: .distantPast),
        .init(before: "Earlier", after: "Bye", cut: 6, gap: 4, suggestsTransition: false, secondPartMinute: .distantPast),
    ])
}

private func transcriptOffers(_ reason: String? = nil, ids: [String] = ["A", "B"]) -> [String: TranscriptOffers] {
    Dictionary(uniqueKeysWithValues: ids.map {
        ($0, .init(run: reason.map { .unavailable(.actionUnderWay, message: $0) } ?? .available,
                   restore: .unavailable(.noPreviousTranscript, message: "transcript")))
    })
}

private func makeState(_ change: (inout RecordingsState) -> Void = { _ in }) -> RecordingsState {
    var state = RecordingsState(calls: calls, mergeAvailable: true, transcriptOffers: transcriptOffers())
    change(&state)
    return state
}

private func makeReady() -> RecordingsState {
    makeState { $0.split = .init(selectedID: "A", request: 1, choices: .ready(choices("a")), control: .available) }
}

private func makeDraft() -> RecordingsState {
    var state = makeReady()
    state.phase = .choosingSplit
    state.transcriptOffers = transcriptOffers("action")
    state.split.control = .unavailable(.busy, text: "Busy")
    state.split.draft = .init(call: calls[0], cut: 6, firstTitle: "First", secondTitle: "Second")
    return state
}

private func makeRunning() -> RecordingsState {
    var state = makeDraft()
    state.phase = .runningSplit
    state.split.control = .unavailable(.finishing, text: "Finishing")
    return state
}

private final class SplitTextSpy: Sendable {
    private let received = Mutex<[SplitMessage]>([])
    var messages: [SplitMessage] { received.withLock { $0 } }

    func text(_ message: SplitMessage) -> String {
        received.withLock { $0.append(message) }
        return switch message {
        case .checking: "Checking"
        case .noChoices: "No gap"
        case .busy: "Busy"
        case .finishing: "Finishing"
        case .failed(.refused(.expiredTranscript)): "Expired"
        case .failed(.refused(.busy)): "Busy"
        case let .failed(.failed(reason)): reason
        case .failed: "Refused"
        case let .refreshFailed(reason): "Refresh: " + reason
        case let .recoveryRequired(reason): "Recover: " + reason
        }
    }
}

private func makeReducer() -> (RecordingsReducer, SplitTextSpy) {
    let spy = SplitTextSpy()
    return (RecordingsReducer(failureMessage: { $0 + $1 }, moveText: stubMoveText, busyMessage: { "busy" },
                              splitMessage: spy.text, transcriptMessage: { $0 == .actionUnderWay ? "action" : "transcript" }), spy)
}

private func assert(_ sut: RecordingsReducer, _ given: RecordingsState, _ event: RecordingsEvent, delivers: RecordingsEffect?,
                    sourceLocation: SourceLocation = #_sourceLocation, _ change: (inout RecordingsState) -> Void = { _ in }) {
    var expected = given
    change(&expected)
    let (state, effect) = sut.reduce(given, event)
    #expect(state == expected, sourceLocation: sourceLocation)
    #expect(effect == delivers, sourceLocation: sourceLocation)
}

private actor SplitSpy: RecordingsSplitChoices, RecordingsSplit {
    private let choices: [String: Result<SplitChoices, SplitRefusal>]
    private let result: Result<SplitReplacement, SplitRefusal>
    private(set) var reads: [String] = []
    private(set) var requests: [SplitRequest] = []

    init(choices: [String: Result<SplitChoices, SplitRefusal>], split: Result<SplitReplacement, SplitRefusal>) {
        self.choices = choices
        result = split
    }

    func splitChoices(id: String) throws -> SplitChoices {
        reads.append(id)
        return try choices[id]!.get()
    }

    func split(_ request: SplitRequest) throws -> SplitReplacement {
        requests.append(request)
        return try result.get()
    }
}

private struct ListPort: RecordingsCalls {
    let calls: [RecordedCall]
    func list() async throws -> [RecordedCall] { calls }
    func rename(id: String, title: String) async throws { Issue.record("Unexpected rename") }
    func delete(id: String) async throws { Issue.record("Unexpected delete") }
    func prepareMove(to destination: URL) async throws -> [MoveCall] { Issue.record("Unexpected prepare"); return [] }
    func move(id: String, to: URL) async throws -> Int64 { Issue.record("Unexpected move"); return 0 }
    func merge(ids: [String]) async throws -> String { Issue.record("Unexpected merge"); return "" }
    func setTags(id: String, tags: [String]) async throws { Issue.record("Unexpected tags save") }
    func restorePreviousTranscript(id: String) async throws { Issue.record("Unexpected restore") }
}

private func makeHandler(_ port: SplitSpy, list: [RecordedCall] = []) -> RecordingsEffectHandler {
    .init(calls: ListPort(calls: list), split: port, transcriptAgain: UnusedTranscriptPort(),
          reserve: { nil }, release: { _ in }, storeFolder: { _ in }, describe: { _ in "Disk failure" })
}

private func event(_ handler: RecordingsEffectHandler, _ effect: RecordingsEffect) async throws -> RecordingsEvent {
    var events: [RecordingsEvent] = []
    for await event in handler.handle(effect) { events.append(event) }
    #expect(events.count == 1)
    return try #require(events.first)
}
