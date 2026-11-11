import Composer
import Testing

@MainActor @Suite(.timeLimit(.minutes(1))) struct SummaryCoordinatorTests {
    private let reducer = SummaryCoordinatorReducer()

    @Test func recoveryDefersOnlyTheFirstCompletionAndAbsenceSubmitsIt() async {
        let given = makeState()
        let loading = assert(given, .recover("call")) {
            $0.sequence = 1; $0.calls["call"] = .init(phase: .recovering, operation: 1)
        }
        let queued = assert(loading, .submit(offer())) { $0.calls["call"]?.submission = offer() }
        _ = assert(queued, .submit(offer(input: "duplicate")))
        _ = assert(queued, .recover("call"))
        let submitting = assert(queued, .recovered("call", .absent)) {
            $0.sequence = 2; $0.calls["call"] = .init(phase: .submitting, operation: 2, submission: offer())
        }
        let spy = CoordinatorJobsSpy()
        let events = EventSpy()
        let doer = SummaryCoordinatorDoer(jobs: spy, send: events.send)
        doer.act(on: loading); doer.act(on: queued)
        await spy.recoverStarted.next()
        #expect(spy.loaded == ["call"])
        spy.completeRecovery(.success(.absent))
        await doer.join()
        #expect(events.values == [.recovered("call", .absent)])
        doer.act(on: submitting); doer.act(on: submitting)
        await spy.submitStarted.next()
        #expect(spy.offered == [offer()])
        spy.completeSubmission(true)
        await doer.join()
        // Observing the completed work again must not start it again.
        doer.act(on: loading); doer.act(on: submitting)
        await doer.join()
        #expect(spy.loaded == ["call"] && spy.offered == [offer()])
        #expect(events.values == [.recovered("call", .absent), .submitted("call", pending: true)])
    }

    @Test(arguments: [SummaryRecovery.pending, .installed])
    func recoveredWorkTakesPrecedenceOverQueuedCompletion(outcome: SummaryRecovery) async {
        let given = makeState(calls: ["call": .init(phase: .recovering, operation: 1, submission: offer())])
        let ready = assert(given, .recovered("call", outcome)) {
            $0.sequence = 2
            $0.calls["call"] = .init(phase: outcome == .pending ? .dispatching : .installed, operation: 2)
        }
        let spy = CoordinatorJobsSpy(), events = EventSpy()
        let doer = SummaryCoordinatorDoer(jobs: spy, send: events.send)
        doer.act(on: ready); doer.act(on: ready)
        await doer.join()
        #expect(spy.dispatched == (outcome == .pending ? ["call"] : []))
        #expect(spy.offered.isEmpty)
        #expect(events.values == (outcome == .pending ? [.dispatched("call")] : []))
        if outcome == .pending {
            _ = assert(ready, .dispatched("call")) {
                $0.sequence = 3; $0.calls["call"] = .init(phase: .installed, operation: 3)
            }
        }
    }

    @Test func recoveryFailureSuppressesQueuedAndLaterSubmissions() async {
        let given = makeState(calls: ["call": .init(phase: .recovering, operation: 1, submission: offer())])
        let failed = assert(given, .recoveryFailed("call")) {
            $0.sequence = 2; $0.calls["call"] = .init(phase: .failing, operation: 2)
        }
        let spy = CoordinatorJobsSpy(), events = EventSpy()
        let doer = SummaryCoordinatorDoer(jobs: spy, send: events.send)
        doer.act(on: given)
        await spy.recoverStarted.next()
        spy.completeRecovery(.failure(CoordinatorFailure()))
        await doer.join()
        #expect(events.values == [.recoveryFailed("call")])
        doer.act(on: failed); doer.act(on: failed)
        await doer.join()
        #expect(spy.failed == ["call"])
        #expect(events.values == [.recoveryFailed("call"), .failureInstalled("call")])
        let installed = assert(failed, .failureInstalled("call")) {
            $0.sequence = 3; $0.calls["call"] = .init(phase: .installed, operation: 3)
        }
        _ = assert(installed, .submit(offer()))
        _ = assert(installed, .recover("call"))
        #expect(spy.offered.isEmpty && spy.dispatched.isEmpty)
    }

    @Test func completionReservesTheCallBeforeStartupAndDoesNotBlockAnotherCall() async {
        let given = makeState()
        let submitting = assert(given, .submit(offer())) {
            $0.sequence = 1; $0.calls["call"] = .init(phase: .submitting, operation: 1, submission: offer())
        }
        _ = assert(submitting, .recover("call"))
        _ = assert(submitting, .submit(offer(input: "duplicate")))
        let independent = assert(submitting, .recover("another")) {
            $0.sequence = 2; $0.calls["another"] = .init(phase: .recovering, operation: 2)
        }
        let spy = CoordinatorJobsSpy(), events = EventSpy()
        let doer = SummaryCoordinatorDoer(jobs: spy, send: events.send)
        doer.act(on: independent)
        await spy.recoverStarted.next(); await spy.submitStarted.next()
        #expect(spy.loaded == ["another"] && spy.offered == [offer()])
        spy.completeRecovery(.success(.absent)); spy.completeSubmission(true)
        await doer.join()
        #expect(events.values.count == 2)
        #expect(events.values.contains(.recovered("another", .absent)))
        #expect(events.values.contains(.submitted("call", pending: true)))
        let absent = assert(independent, .recovered("another", .absent)) { $0.calls["another"] = nil }
        let dispatch = assert(absent, .submitted("call", pending: true)) {
            $0.sequence = 3; $0.calls["call"] = .init(phase: .dispatching, operation: 3)
        }
        doer.act(on: dispatch); doer.act(on: dispatch)
        #expect(spy.dispatched == ["call"])
    }

    @Test(arguments: [false, true])
    func stopDispatchPreservesLoadedOrNewPendingWork(recovering: Bool) async {
        let given = makeState(calls: ["call": .init(phase: recovering ? .recovering : .submitting, operation: 1, submission: offer())])
        let stopped = assert(given, .stopDispatch) { $0.dispatch = false }
        let event: SummaryCoordinatorEvent = recovering ? .recovered("call", .pending) : .submitted("call", pending: true)
        let pending = assert(stopped, event) {
            $0.sequence = 2; $0.calls["call"] = .init(phase: .pending, operation: 2)
        }
        let spy = CoordinatorJobsSpy(), events = EventSpy()
        let doer = SummaryCoordinatorDoer(jobs: spy, send: events.send)
        doer.act(on: pending); doer.act(on: pending)
        await doer.join()
        #expect(spy.dispatched.isEmpty && spy.offered.isEmpty && spy.loaded.isEmpty)
        #expect(events.values.isEmpty)
    }

    @Test func shutdownDrainsRecoveryAndClaimBeforeJoiningWithoutDispatch() async {
        let given = makeState(calls: ["call": .init(phase: .recovering, operation: 1, submission: offer())])
        let draining = assert(given, .shutdown) { $0.phase = .draining; $0.dispatch = false }
        _ = assert(draining, .submit(offer(call: "late")))
        _ = assert(draining, .recover("late"))
        let submitting = assert(draining, .recovered("call", .absent)) {
            $0.sequence = 2; $0.calls["call"] = .init(phase: .submitting, operation: 2, submission: offer())
        }
        let joining = assert(submitting, .submitted("call", pending: true)) {
            $0.phase = .joining; $0.sequence = 3; $0.calls["call"] = .init(phase: .pending, operation: 3)
        }
        let spy = CoordinatorJobsSpy(), events = EventSpy()
        let doer = SummaryCoordinatorDoer(jobs: spy, send: events.send)
        doer.act(on: draining)
        await spy.recoverStarted.next()
        #expect(spy.joins == 0)
        spy.completeRecovery(.success(.absent)); await doer.join()
        doer.act(on: submitting)
        await spy.submitStarted.next()
        #expect(spy.joins == 0)
        spy.completeSubmission(true); await doer.join()
        doer.act(on: joining); doer.act(on: joining)
        await spy.joinStarted.next()
        #expect(spy.joins == 1 && spy.dispatched.isEmpty)
        spy.completeJoin()
        await doer.join()
        #expect(events.values == [.recovered("call", .absent), .submitted("call", pending: true), .joined])
        let ended = assert(joining, .joined) { $0.phase = .ended }
        _ = assert(ended, .submit(offer()))
        _ = assert(ended, .shutdown)
        _ = assert(ended, .recovered("call", .pending))
    }

    @Test func nonPendingSubmissionInstallsWithoutDispatch() async {
        let given = makeState(calls: ["call": .init(phase: .submitting, operation: 1, submission: offer())])
        let installed = assert(given, .submitted("call", pending: false)) {
            $0.sequence = 2; $0.calls["call"] = .init(phase: .installed, operation: 2)
        }
        let spy = CoordinatorJobsSpy(), events = EventSpy()
        let doer = SummaryCoordinatorDoer(jobs: spy, send: events.send)
        doer.act(on: installed); await doer.join()
        #expect(spy.dispatched.isEmpty && spy.offered.isEmpty)
        #expect(events.values.isEmpty)
        _ = assert(installed, .submit(offer()))
        _ = assert(installed, .submitted("call", pending: true))
    }

    @Test func stopDispatchWithdrawsAnUnperformedApprovalBeforeShutdown() async {
        let given = makeState(calls: ["call": .init(phase: .dispatching, operation: 1)])
        let stopped = assert(given, .stopDispatch) {
            $0.dispatch = false; $0.sequence = 2; $0.calls["call"] = .init(phase: .pending, operation: 2)
        }
        let spy = CoordinatorJobsSpy(), events = EventSpy()
        let doer = SummaryCoordinatorDoer(jobs: spy, send: events.send)
        doer.act(on: stopped); await doer.join()
        #expect(spy.dispatched.isEmpty && events.values.isEmpty)
        let joining = assert(stopped, .shutdown) { $0.phase = .joining }
        doer.act(on: joining)
        await spy.joinStarted.next()
        spy.completeJoin(); await doer.join()
        #expect(events.values == [.joined])
    }

    @Test func shutdownWithNoOutstandingWorkJoinsImmediately() async {
        let given = makeState()
        let joining = assert(given, .shutdown) { $0.dispatch = false; $0.phase = .joining }
        let spy = CoordinatorJobsSpy(), events = EventSpy()
        let doer = SummaryCoordinatorDoer(jobs: spy, send: events.send)
        doer.act(on: joining)
        await spy.joinStarted.next()
        spy.completeJoin(); await doer.join()
        #expect(events.values == [.joined])
        #expect(spy.joins == 1)
    }

    @Test(arguments: [false, true])
    func explicitRetryRunsOnceAndDeliversItsResult(fails: Bool) async {
        let given = makeState(calls: ["call": .init(phase: .installed, operation: 1)])
        let retrying = assert(given, .retry("call")) {
            $0.sequence = 2; $0.calls["call"] = .init(phase: .retrying, operation: 2)
        }
        _ = assert(retrying, .retry("call"))
        _ = assert(makeState(), .retry("call"))
        let spy = CoordinatorJobsSpy(), events = EventSpy()
        let doer = SummaryCoordinatorDoer(jobs: spy, send: events.send)
        doer.act(on: retrying); doer.act(on: retrying)
        await spy.retryStarted.next()
        #expect(spy.retried == ["call"])
        spy.completeRetry(fails ? .failure(CoordinatorFailure()) : .success(()))
        await doer.join()
        let event: SummaryCoordinatorEvent = fails ? .retryFailed("call") : .retried("call")
        #expect(events.values == [event])
        let finished = assert(retrying, event) {
            $0.sequence = 3
            $0.calls["call"] = .init(phase: fails ? .installed : .dispatching, operation: 3)
            if fails { $0.retryFailures.insert("call") }
        }
        doer.act(on: finished)
        #expect(spy.dispatched == (fails ? [] : ["call"]))
        _ = assert(assert(given, .stopDispatch) { $0.dispatch = false }, .retry("call"))
        if !fails {
            let stopped = assert(retrying, .stopDispatch) { $0.dispatch = false }
            _ = assert(stopped, .retried("call")) {
                $0.sequence = 3; $0.calls["call"] = .init(phase: .pending, operation: 3)
            }
        }
    }

    @discardableResult private func assert(_ state: SummaryCoordinatorState, _ event: SummaryCoordinatorEvent,
                                           changes: (inout SummaryCoordinatorState) -> Void = { _ in }) -> SummaryCoordinatorState {
        var expected = state; changes(&expected)
        let result = reducer.reduce(state, event)
        #expect(result == expected)
        return result
    }
}

private func makeState(calls: [String: SummaryCoordinatorState.Call] = [:]) -> SummaryCoordinatorState {
    .init(sequence: calls.values.map(\.operation).max() ?? 0, calls: calls)
}
private func offer(call: String = "call", input: String = "input") -> SummarySubmission {
    .init(call: call, input: input, entries: [.init(label: "A", time: "0", text: "spoken")], finalWrite: true, usable: true)
}
private struct CoordinatorFailure: Error {}
@MainActor private final class EventSpy {
    var values: [SummaryCoordinatorEvent] = []
    func send(_ event: SummaryCoordinatorEvent) { values.append(event) }
}
@MainActor private final class CoordinatorJobsSpy: SummaryCoordinatorJobs {
    var loaded: [String] = [], offered: [SummarySubmission] = [], dispatched: [String] = [], failed: [String] = []
    var joins = 0
    let recoverStarted = Signal(), submitStarted = Signal(), joinStarted = Signal()
    private let recovery = AsyncStream<Result<SummaryRecovery, CoordinatorFailure>>.makeStream()
    private let submission = AsyncStream<Bool>.makeStream()
    private let joined = Signal()
    func recover(call: String) async throws -> SummaryRecovery {
        loaded.append(call); recoverStarted.send()
        var values = recovery.stream.makeAsyncIterator()
        return try await values.next()!.get()
    }
    func submit(_ value: SummarySubmission) async -> Bool {
        offered.append(value); submitStarted.send()
        var values = submission.stream.makeAsyncIterator()
        return await values.next()!
    }
    func retry(call: String) async throws {
        retried.append(call); retryStarted.send()
        var values = retryResult.stream.makeAsyncIterator()
        try await values.next()!.get()
    }
    var retried: [String] = []
    let retryStarted = Signal()
    private let retryResult = AsyncStream<Result<Void, CoordinatorFailure>>.makeStream()
    func completeRetry(_ result: Result<Void, CoordinatorFailure>) { retryResult.continuation.yield(result) }
    func dispatch(call: String) { dispatched.append(call) }
    func recoveryFailed(call: String) async { failed.append(call) }
    func join() async { joins += 1; joinStarted.send(); await joined.next() }
    func completeRecovery(_ result: Result<SummaryRecovery, CoordinatorFailure>) { recovery.continuation.yield(result) }
    func completeSubmission(_ pending: Bool) { submission.continuation.yield(pending) }
    func completeJoin() { joined.send() }
}
