import Foundation
import Recordings
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1)))
struct RecordingsTranscriptAgainTests {
    @Test func S1_waitsAreKeptAsReported() async {
        for wait: TranscriptWait in [.preparing, .hearing(0.4), .hearing(0.7), .finishing] {
            await assert(makeRunning(), .transcriptReported(request: 1, .waiting(wait)), delivers: nil) {
                $0.transcriptRun?.wait = wait
            }
        }
        await expectRun(reports: [.waiting(.preparing), .waiting(.hearing(0.4)), .waiting(.hearing(0.7)), .waiting(.finishing), .stopped])
    }

    @Test func S2_madeListsAgainAndSelectsTheCall() async {
        await assertMade(makeRunning { $0.transcriptRun?.wait = .finishing })
        let fresh = makeCall("A", title: "Port listing")
        await assert(makeReady {
            $0.isListing = true; $0.listRequest = 1; $0.selectedCallID = "A"
            setOffers(&$0, .actionUnderWay)
        }, .listed(request: 1, [fresh]), delivers: nil) {
            $0.calls = [fresh]; $0.isListing = false; setOffers(&$0, nil)
        }
    }

    @Test func S3_failureKeepsItsReasonAndRetryOffer() async {
        await assert(makeRunning { $0.transcriptRun?.wait = .hearing(0.4) }, .transcriptReported(request: 1, .failed("hearing failed")), delivers: nil) {
            $0.transcriptRun = nil; $0.failure = .init(id: "A", reason: "hearing failed", kind: .transcriptRun); setOffers(&$0, nil)
        }
        await expectRun(reports: [.failed("hearing failed")])
    }

    @Test func S4_cancelStopsOnceAndStoppedHasNoFailure() async {
        await assert(makeRunning(), .cancelTranscriptAgain, delivers: .stopTranscriptAgain(id: "A", request: 1)) {
            $0.transcriptRun?.stopReason = .cancelled
        }
        let cancelling = makeRunning { $0.transcriptRun?.stopReason = .cancelled }
        await assert(cancelling, .cancelTranscriptAgain, delivers: nil)
        await assert(cancelling, .transcriptReported(request: 1, .stopped), delivers: nil) {
            $0.transcriptRun = nil; setOffers(&$0, nil)
        }
        await expectRun(reports: [.stopped])
    }

    @Test func S5_cancelTooLateStillMakes() async {
        let finishing = makeRunning { $0.transcriptRun?.wait = .finishing }
        await assert(finishing, .cancelTranscriptAgain, delivers: .stopTranscriptAgain(id: "A", request: 1)) {
            $0.transcriptRun?.stopReason = .cancelled
        }
        await assertMade(makeRunning { $0.transcriptRun?.wait = .finishing; $0.transcriptRun?.stopReason = .cancelled })
        await expectRun(reports: [.made])
    }

    @Test func S6_recordingStopsOnceAndKeepsTheReasonUnlessMade() async {
        await assert(makeRunning(), .recordingStarted, delivers: .stopTranscriptAgain(id: "A", request: 1)) {
            $0.transcriptRun?.stopReason = .recordingStarted
        }
        let stopping = makeRunning { $0.transcriptRun?.stopReason = .recordingStarted }
        await assert(stopping, .recordingStarted, delivers: nil)
        let message = TranscriptMessageSpy()
        await assert(stopping, .transcriptReported(request: 1, .stopped), delivers: nil, reducer: message.reducer) {
            $0.transcriptRun = nil; $0.failure = .init(id: "A", reason: "text", kind: .transcriptStopped); setOffers(&$0, nil)
        }
        #expect(message.received == [.recordingStarted])
        await assertMade(stopping)
        await expectRun(reports: [.stopped])
    }

    @Test func S7_retryChecksTheFailedCallAgain() async {
        let failed = makeReady { $0.failure = .init(id: "A", reason: "failed"); $0.selectedCallID = "A" }
        await assert(failed, .makeTranscriptAgain("A"), delivers: .makeTranscriptAgain(id: "A", request: 1)) {
            $0.failure = nil; $0.transcriptRequest = 1; $0.transcriptRun = .init(id: "A", request: 1)
            setOffers(&$0, .runningTranscript(id: "A"))
        }
        await assert(makeReady {
            $0.failure = .init(id: "A", reason: "failed"); $0.mergeAvailable = false; setOffers(&$0, .notIdle)
        }, .makeTranscriptAgain("A"), delivers: nil) { $0.failure = .init(id: "A", reason: "text") }
    }

    @Test func S8_shutdownSettlesOnlyAfterThePortAnswers() async {
        await assert(makeRunning(), .stopActions, delivers: .stopTranscriptAgain(id: "A", request: 1)) {
            $0.stopping = true; $0.transcriptRun?.stopReason = .shutdown
        }
        let stopping = makeRunning { $0.stopping = true; $0.transcriptRun?.stopReason = .shutdown }
        await assert(stopping, .stopActions, delivers: nil)
        for report: TranscriptReport in [.stopped, .failed("failed"), .made] {
            await assert(stopping, .transcriptReported(request: 1, report), delivers: report == .made ? .list(request: 1) : nil) {
                $0.transcriptRun = nil; $0.stopped = true; setOffers(&$0, .actionUnderWay)
                if report == .made {
                    $0.isListing = true; $0.listRequest = 1; $0.transcriptChanged = .init(id: "A", request: 1)
                }
                if case let .failed(reason) = report { $0.failure = .init(id: "A", reason: reason, kind: .transcriptRun) }
            }
        }
        await expectRun(reports: [.stopped])
    }

    @Test func S9_notIdleAloneStopsNothing() async {
        await assert(makeRunning(), .mergeAvailability(false), delivers: nil) { $0.mergeAvailable = false }
        await assert(makeRunning(), .recordingChanged("recording"), delivers: nil) { $0.recordingID = "recording" }
    }

    @Test func S10_madeAnnouncesTheChangedCallOnce() async {
        await assertMade(makeRunning { $0.transcriptRun?.wait = .finishing })
        let made = makeReady {
            $0.selectedCallID = "A"; $0.transcriptRequest = 1; $0.transcriptChanged = .init(id: "A", request: 1)
        }
        await assert(made, .transcriptReported(request: 1, .made), delivers: nil)
        await assertMade(makeRunning {
            $0.transcriptRequest = 2; $0.transcriptRun?.request = 2; $0.transcriptRun?.wait = .finishing; $0.transcriptChanged = .init(id: "A", request: 1)
        })
        await expectRun(reports: [.made])
    }

    @Test func stoppingARetryNamesThatRun() async {
        await assert(makeRunning { $0.transcriptRequest = 2; $0.transcriptRun?.request = 2 },
                     .cancelTranscriptAgain, delivers: .stopTranscriptAgain(id: "A", request: 2)) {
            $0.transcriptRun?.stopReason = .cancelled
        }
    }

    @Test func reportsFromAnEarlierRunCannotFinishARetry() async {
        let retry = makeRunning { $0.transcriptRequest = 2; $0.transcriptRun?.request = 2 }
        for report: TranscriptReport in [.waiting(.finishing), .made, .stopped, .failed("old")] {
            await assert(retry, .transcriptReported(request: 1, report), delivers: nil)
        }
    }

    @Test func recordingAfterCancellationPreservesItsReasonWithoutASecondStop() async {
        await assert(makeRunning { $0.transcriptRun?.stopReason = .cancelled }, .recordingStarted, delivers: nil) {
            $0.transcriptRun?.stopReason = .recordingStarted
        }
        let recording = makeRunning { $0.transcriptRun?.stopReason = .recordingStarted }
        await assert(recording, .cancelTranscriptAgain, delivers: nil)
        await assert(recording, .stopActions, delivers: nil) { $0.stopping = true }
        await assert(recording, .transcriptReported(request: 1, .failed("interrupted")), delivers: nil) {
            $0.transcriptRun = nil; $0.failure = .init(id: "A", reason: "text", kind: .transcriptStopped); setOffers(&$0, nil)
        }
    }
}

@Suite(.timeLimit(.minutes(1)))
struct RecordingsTranscriptAgainOfferTests {
    @Test func S1_wholeIdleCallOffersARun() async {
        let spy = TranscriptMessageSpy()
        _ = spy.reducer
        #expect(spy.received.isEmpty)
        await assert(makeReady { $0.calls = []; $0.transcriptOffers = [:]; $0.isListing = true },
                     .listed(request: 0, [makeCall()]), delivers: nil, reducer: spy.reducer) {
            $0.calls = [makeCall()]; $0.isListing = false; setOffers(&$0, nil)
        }
        await assert(makeReady(), .clearFailure, delivers: nil, reducer: spy.reducer)
        #expect(spy.received.isEmpty)
    }

    @Test func S2_missingCallTrackNamesTheCallAndTrack() async {
        await assertMissing([.init(id: "A", track: .call)])
    }

    @Test func S3_missingAllAudioNamesBothTracks() async {
        await assertMissing([.init(id: "A", track: .microphone), .init(id: "A", track: .call)])
    }

    @Test func S4_nestedMissingAudioNamesTheOriginalCall() async {
        await assertMissing([.init(id: "innermost", track: .microphone)])
    }

    @Test func S5_offersFollowIdleness() async {
        let spy = TranscriptMessageSpy()
        await assert(makeReady(), .mergeAvailability(false), delivers: nil, reducer: spy.reducer) {
            $0.mergeAvailable = false; setOffers(&$0, .notIdle)
        }
        #expect(spy.received == [.notIdle, .notIdle])
        await assert(makeReady { $0.mergeAvailable = false; setOffers(&$0, .notIdle) }, .mergeAvailability(true), delivers: nil) {
            $0.mergeAvailable = true; setOffers(&$0, nil)
        }
    }

    @Test func S6_requestChecksIdlenessAgain() async {
        let spy = TranscriptMessageSpy()
        await assert(makeReady { $0.mergeAvailable = false; setOffers(&$0, .notIdle) }, .makeTranscriptAgain("A"), delivers: nil, reducer: spy.reducer) {
            $0.failure = .init(id: "A", reason: "text")
        }
        #expect(spy.received == [.notIdle])
    }

    @Test func S7_runWaitsForAMerge() async {
        let spy = TranscriptMessageSpy()
        await assert(makeReady { $0.phase = .runningMerge; setOffers(&$0, .actionUnderWay) }, .makeTranscriptAgain("A"), delivers: nil, reducer: spy.reducer) {
            $0.failure = .init(id: "A", reason: "text")
        }
        #expect(spy.received == [.actionUnderWay])
    }

    @Test func S8_runsOwnCallCannotBeRenamed() async {
        let spy = TranscriptMessageSpy()
        await assert(makeRunning(), .rename(id: "A", title: "New"), delivers: nil, reducer: spy.reducer) {
            $0.failure = .init(id: "A", reason: "text")
        }
        #expect(spy.received == [.runningTranscript(id: "A")])
    }

    @Test func S9_anotherCallStaysUsable() async {
        let other = makeCall("B")
        let running = makeRunning { $0.calls.append(other); setOffers(&$0, .runningTranscript(id: "A")) }
        await assert(running, .rename(id: "B", title: "New"), delivers: .rename(id: "B", title: "New")) { $0.phase = .renaming("B") }
        await assert(makeRunning {
            $0.calls.append(other); $0.phase = .renaming("B"); setOffers(&$0, .runningTranscript(id: "A"))
        }, .renamed("B"), delivers: .list(request: 1)) { $0.phase = .idle; $0.isListing = true; $0.listRequest = 1 }
        await assert(running, .askDelete("B"), delivers: nil) { $0.phase = .askingDelete("B") }
        await assert(makeRunning { $0.phase = .askingDelete("B") }, .confirmDelete, delivers: .delete("B")) { $0.phase = .deleting("B") }
        await assert(makeRunning { $0.phase = .deleting("B") }, .deleted("B"), delivers: .list(request: 1)) {
            $0.phase = .idle; $0.isListing = true; $0.listRequest = 1
        }
    }

    @Test func S10_layoutIsLockedDuringARun() async {
        for event: RecordingsEvent in [.enterMergeMode, .confirmMerge, .mergeAnyway,
                                      .chooseFolder(URL(fileURLWithPath: "/new")), .confirmMove, .retryMove,
                                      .restorePreviousTranscript("A"), .restorePreviousTranscript("B")] {
            let spy = TranscriptMessageSpy()
            await assert(makeRunning(), event, delivers: nil, reducer: spy.reducer) {
                let id: String?
                if case let .restorePreviousTranscript(call) = event { id = call } else { id = nil }
                $0.failure = .init(id: id, reason: "text")
            }
            #expect(spy.received == [.runningTranscript(id: "A")])
        }
    }

    @Test func S11_restoreIsOfferedOnlyWhenItCanStart() async {
        await assert(makeReady { $0.calls = []; $0.transcriptOffers = [:]; $0.isListing = true },
                     .listed(request: 0, [makeCall()]), delivers: nil) {
            $0.calls = [makeCall()]; $0.isListing = false; setOffers(&$0, nil)
        }
        await assert(makeReady(), .mergeAvailability(false), delivers: nil) { $0.mergeAvailable = false; setOffers(&$0, .notIdle) }
        let noPrevious = makeCall(previous: false)
        await assert(makeReady { $0.isListing = true; setOffers(&$0, .actionUnderWay) },
                     .listed(request: 0, [noPrevious]), delivers: nil) {
            $0.calls = [noPrevious]; $0.isListing = false
            $0.transcriptOffers = ["A": .init(run: .available, restore: .unavailable(.noPreviousTranscript, message: "text"))]
        }
    }

    @Test func S12_runsOwnCallCannotBeDeleted() async {
        for event: RecordingsEvent in [.askDelete("A"), .confirmDelete] {
            let spy = TranscriptMessageSpy()
            await assert(makeRunning { if event == .confirmDelete { $0.phase = .askingDelete("A") } }, event, delivers: nil, reducer: spy.reducer) {
                $0.failure = .init(id: "A", reason: "text")
            }
            #expect(spy.received == [.runningTranscript(id: "A")])
        }
    }

    @Test func everyOtherActionBlocksRunAndRestoreOffers() async {
        for phase: RecordingsState.Phase in [.renaming("B"), .deleting("B"), .askingDelete("B"), .merging,
                                            .warnedFarApart, .runningMerge, .countingMove, .askingMove, .reservingMove,
                                            .preparingMove, .moving, .storingFolder, .releasingMove, .failedMove,
                                            .restoring("B")] {
            await assert(makeReady { $0.phase = phase; setOffers(&$0, .actionUnderWay) }, .makeTranscriptAgain("A"), delivers: nil) {
                $0.failure = .init(id: "A", reason: "text")
            }
        }
        await assert(makeRunning(), .makeTranscriptAgain("A"), delivers: nil) { $0.failure = .init(id: "A", reason: "text") }
        await assert(makeReady(), .makeTranscriptAgain("missing"), delivers: nil) { $0.failure = .init(id: "missing", reason: "text") }
    }

    @Test func listingRetiresOffersForCallsNoLongerListed() async {
        await assert(makeReady { $0.isListing = true; setOffers(&$0, .actionUnderWay) }, .listed(request: 0, []), delivers: nil) {
            $0.calls = []; $0.isListing = false; $0.transcriptOffers = [:]
        }
    }
}

private func makeCall(_ id: String = "A", title: String = "Call", previous: Bool = true,
                      missing: [MissingRecordingTrack] = []) -> RecordedCall {
    RecordedCall(id: id, title: title, start: .distantPast, duration: 60,
                 hasPreviousTranscript: previous, missingTracks: missing)
}

private func makeReady(_ change: (inout RecordingsState) -> Void = { _ in }) -> RecordingsState {
    var state = RecordingsState(calls: [makeCall()], mergeAvailable: true,
                                transcriptOffers: ["A": .init(run: .available, restore: .available)])
    change(&state)
    return state
}

private func makeRunning(_ change: (inout RecordingsState) -> Void = { _ in }) -> RecordingsState {
    makeReady {
        $0.transcriptRun = .init(id: "A", request: 1, wait: .hearing(0.4)); $0.transcriptRequest = 1; $0.selectedCallID = "A"
        setOffers(&$0, .runningTranscript(id: "A")); change(&$0)
    }
}

private func setOffers(_ state: inout RecordingsState, _ reason: TranscriptRefusal?) {
    let offer = reason.map { TranscriptOffer.unavailable($0, message: "text") } ?? .available
    state.transcriptOffers = Dictionary(uniqueKeysWithValues: state.calls.map { ($0.id, .init(run: offer, restore: offer)) })
}

private func assert(_ state: RecordingsState, _ event: RecordingsEvent, delivers effect: RecordingsEffect?,
                    reducer: RecordingsReducer? = nil, sourceLocation: SourceLocation = #_sourceLocation,
                    _ change: (inout RecordingsState) -> Void = { _ in }) async {
    var expected = state
    change(&expected)
    let result = (reducer ?? TranscriptMessageSpy().reducer).reduce(state, event)
    #expect(result.0 == expected, sourceLocation: sourceLocation)
    #expect(result.1 == effect, sourceLocation: sourceLocation)
    await expectEffect(result.1, sourceLocation: sourceLocation)
}

private func assertMade(_ state: RecordingsState, sourceLocation: SourceLocation = #_sourceLocation) async {
    let request = state.transcriptRun!.request
    await assert(state, .transcriptReported(request: request, .made), delivers: .list(request: state.listRequest + 1), sourceLocation: sourceLocation) {
        $0.transcriptRun = nil; $0.selectedCallID = "A"; $0.failure = nil
        $0.transcriptChanged = .init(id: "A", request: request)
        $0.isListing = true; $0.listRequest += 1; setOffers(&$0, .actionUnderWay)
    }
}

private func assertMissing(_ tracks: [MissingRecordingTrack], sourceLocation: SourceLocation = #_sourceLocation) async {
    let call = makeCall(missing: tracks)
    let spy = TranscriptMessageSpy()
    await assert(makeReady { $0.calls = []; $0.transcriptOffers = [:]; $0.isListing = true },
                 .listed(request: 0, [call]), delivers: nil, reducer: spy.reducer, sourceLocation: sourceLocation) {
        $0.calls = [call]; $0.isListing = false
        $0.transcriptOffers = ["A": .init(run: .unavailable(.missingTracks(tracks), message: "text"), restore: .available)]
    }
    #expect(spy.received == [.missingTracks(tracks)], sourceLocation: sourceLocation)
    await assert(makeReady {
        $0.calls = [call]
        $0.transcriptOffers = ["A": .init(run: .unavailable(.missingTracks(tracks), message: "text"), restore: .available)]
    }, .makeTranscriptAgain("A"), delivers: nil, reducer: spy.reducer, sourceLocation: sourceLocation) {
        $0.failure = .init(id: "A", reason: "text")
    }
    #expect(spy.received == [.missingTracks(tracks), .missingTracks(tracks)], sourceLocation: sourceLocation)
}

private final class TranscriptMessageSpy: Sendable {
    private let storage = Mutex<[TranscriptRefusal]>([])
    var received: [TranscriptRefusal] { storage.withLock { $0 } }
    var reducer: RecordingsReducer {
        RecordingsReducer(failureMessage: { $0 + $1 }, moveText: stubMoveText, busyMessage: { "busy" }, transcriptMessage: { reason in
            self.storage.withLock { $0.append(reason) }; return "text"
        })
    }
}

/// Tests of other calls ports must never start or stop a transcript run.
struct UnusedTranscriptPort: RecordingsTranscriptAgain {
    func run(id: String, request: Int) -> AsyncStream<TranscriptReport> { Issue.record("Unexpected transcript run"); return AsyncStream { $0.finish() } }
    func stop(id: String, request: Int) async { Issue.record("Unexpected transcript stop") }
}

private final class TranscriptPortSpy: RecordingsTranscriptAgain, Sendable {
    private struct Storage: Sendable {
        var runs: [RecordingsEffect] = []
        var stops: [RecordingsEffect] = []
        var output: AsyncStream<TranscriptReport>.Continuation?
        var started: CheckedContinuation<Void, Never>?
    }
    private let storage = Mutex(Storage())
    var runs: [RecordingsEffect] { storage.withLock { $0.runs } }
    var stops: [RecordingsEffect] { storage.withLock { $0.stops } }
    func run(id: String, request: Int) -> AsyncStream<TranscriptReport> {
        AsyncStream { output in
            let waiter = storage.withLock { state in
                state.runs.append(.makeTranscriptAgain(id: id, request: request)); state.output = output
                let waiter = state.started; state.started = nil; return waiter
            }
            waiter?.resume()
        }
    }
    func stop(id: String, request: Int) async { storage.withLock { $0.stops.append(.stopTranscriptAgain(id: id, request: request)) } }
    func report(_ reports: [TranscriptReport]) async {
        await withCheckedContinuation { waiter in
            let started = storage.withLock { state in
                if state.output != nil { return true }; state.started = waiter; return false
            }
            if started { waiter.resume() }
        }
        let output = storage.withLock { $0.output }
        for report in reports { output?.yield(report) }
        output?.finish()
    }
}

private actor TranscriptCallsSpy: RecordingsCalls {
    private(set) var received: [RecordingsEffect] = []
    private var answer: CheckedContinuation<[RecordedCall], Never>?
    private var started: CheckedContinuation<Void, Never>?
    private func request(_ effect: RecordingsEffect) async -> [RecordedCall] {
        received.append(effect)
        return await withCheckedContinuation { answer = $0; started?.resume(); started = nil }
    }
    func complete(_ calls: [RecordedCall]) async {
        if answer == nil { await withCheckedContinuation { started = $0 } }
        answer?.resume(returning: calls); answer = nil
    }
    func list() async throws -> [RecordedCall] { await request(.list(request: 0)) }
    func rename(id: String, title: String) async throws { _ = await request(.rename(id: id, title: title)) }
    func delete(id: String) async throws { _ = await request(.delete(id)) }
    func restorePreviousTranscript(id: String) async throws { Issue.record("Unexpected restore") }
    func prepareMove(to destination: URL) async throws -> [MoveCall] { Issue.record("Unexpected move"); return [] }
    func move(id: String, to: URL) async throws -> Int64 { Issue.record("Unexpected move"); return 0 }
    func merge(ids: [String]) async throws -> String { Issue.record("Unexpected merge"); return "" }
    func setTags(id: String, tags: [String]) async throws { Issue.record("Unexpected tags save") }
}

private func makeHandler(_ calls: TranscriptCallsSpy, _ port: TranscriptPortSpy) -> RecordingsEffectHandler {
    RecordingsEffectHandler(calls: calls, transcriptAgain: port,
                            reserve: { Issue.record("Unexpected reserve"); return nil },
                            release: { _ in Issue.record("Unexpected release") },
                            storeFolder: { _ in Issue.record("Unexpected folder write") }, describe: { $0.localizedDescription })
}

private func collect(_ handler: RecordingsEffectHandler, _ effect: RecordingsEffect) async -> [RecordingsEvent] {
    var events: [RecordingsEvent] = []
    for await event in handler.handle(effect) { events.append(event) }
    return events
}

private func expectRun(reports: [TranscriptReport], sourceLocation: SourceLocation = #_sourceLocation) async {
    let calls = TranscriptCallsSpy(), port = TranscriptPortSpy()
    let handler = makeHandler(calls, port)
    let output = Task { await collect(handler, .makeTranscriptAgain(id: "A", request: 9)) }
    await port.report(reports)
    #expect(await output.value == reports.map { .transcriptReported(request: 9, $0) }, sourceLocation: sourceLocation)
    #expect(port.runs == [.makeTranscriptAgain(id: "A", request: 9)], sourceLocation: sourceLocation)
    #expect(await calls.received.isEmpty, sourceLocation: sourceLocation)
}

private func expectEffect(_ effect: RecordingsEffect?, sourceLocation: SourceLocation) async {
    let calls = TranscriptCallsSpy(), port = TranscriptPortSpy()
    let handler = makeHandler(calls, port)
    if let effect {
        let output = Task { await collect(handler, effect) }
        switch effect {
        case let .makeTranscriptAgain(id, request):
            await port.report([.waiting(.preparing), .made])
            #expect(await output.value == [.transcriptReported(request: request, .waiting(.preparing)), .transcriptReported(request: request, .made)], sourceLocation: sourceLocation)
            #expect(port.runs == [.makeTranscriptAgain(id: id, request: request)], sourceLocation: sourceLocation)
        case let .stopTranscriptAgain(id, request):
            #expect(await output.value.isEmpty, sourceLocation: sourceLocation)
            #expect(port.stops == [.stopTranscriptAgain(id: id, request: request)], sourceLocation: sourceLocation)
        case let .list(request):
            let fresh = [makeCall("A", title: "Port listing")]
            await calls.complete(fresh)
            #expect(await output.value == [.listed(request: request, fresh)], sourceLocation: sourceLocation)
            #expect(await calls.received == [.list(request: 0)], sourceLocation: sourceLocation)
        case let .rename(id, title):
            await calls.complete([])
            #expect(await output.value == [.renamed(id)], sourceLocation: sourceLocation)
            #expect(await calls.received == [.rename(id: id, title: title)], sourceLocation: sourceLocation)
        case let .delete(id):
            await calls.complete([])
            #expect(await output.value == [.deleted(id)], sourceLocation: sourceLocation)
            #expect(await calls.received == [.delete(id)], sourceLocation: sourceLocation)
        default: Issue.record("Unexpected effect", sourceLocation: sourceLocation)
        }
    }
}
