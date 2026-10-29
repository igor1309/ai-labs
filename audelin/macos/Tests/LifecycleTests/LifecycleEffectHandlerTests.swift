import Lifecycle
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1)))
struct LifecycleEffectHandlerTests {

    @Test func stopDeliveryDeliversDeliveryStoppedOnceDeliveryHasStopped() async {

        let (sut, spies) = makeSUT()
        await expect(sut, with: .stopDelivery, toDeliver: .deliveryStopped, on: { await spies.delivery.complete() })
        #expect(spies.log.values == ["delivery stop"])
    }

    @Test func stopRecordingRequestsStopBeforeDrainingAndDeliversDrained() async {

        let (sut, spies) = makeSUT()
        await expect(sut, with: .stopRecording, toDeliver: .drained, on: { await spies.drain.complete() })
        #expect(spies.log.values == ["request stop", "drain"])
    }

    @Test func waitForIdleDeliversIdleOnlyOnceRecordingIsIdle() async {

        let (sut, spies) = makeSUT()
        await expect(sut, with: .waitForIdle, toDeliver: .idle, on: {
            await spies.states.complete(with: [.busy, .busy, .idle])
        })
        #expect(spies.log.values == ["states"])
    }

    @Test func waitForIdleDeliversDrainedWhenObservationEndsWithoutIdle() async {

        let (sut, spies) = makeSUT()
        await expect(sut, with: .waitForIdle, toDeliver: .drained, on: { await spies.states.complete(with: [.busy]) })
    }

    @Test func endDeliversEndedOnceRecordingHasEnded() async {

        let (sut, spies) = makeSUT()
        await expect(sut, with: .end, toDeliver: .ended, on: { await spies.end.complete() })
        #expect(spies.log.values == ["end"])
    }

    @Test func terminateDeliversTerminatedOnceTerminateReturns() async {

        let (sut, spies) = makeSUT()
        await expect(sut, with: .terminate, toDeliver: .terminated, on: { await spies.terminate.complete() })
        #expect(spies.log.values == ["terminate"])
    }

    @Test func effectCallsOnlyItsOwnCollaborator() async {

        let (sut, spies) = makeSUT()
        await expect(sut, with: .end, toDeliver: .ended, on: { await spies.end.complete() })
        #expect(await spies.delivery.calls == 0)
        #expect(await spies.drain.calls == 0)
        #expect(await spies.states.calls == 0)
        #expect(await spies.terminate.calls == 0)
    }
}

private struct Spies {

    let log = Log()
    let delivery = Spy<Void>(), drain = Spy<Void>(), end = Spy<Void>(), terminate = Spy<Void>()
    let states = Spy<[LifecycleRecordingState]>()
}

private func makeSUT() -> (LifecycleEffectHandler, Spies) {

    let spies = Spies()
    let sut = LifecycleEffectHandler(
        delivery: DeliverySpy(spies: spies), recording: RecordingSpy(spies: spies),
        terminate: { spies.log.append("terminate"); await spies.terminate.call() }
    )
    return (sut, spies)
}

private struct DeliverySpy: LifecycleDelivery {

    let spies: Spies
    func stop() async { spies.log.append("delivery stop"); await spies.delivery.call() }
}

private struct RecordingSpy: LifecycleRecording {

    let spies: Spies

    func requestStop() { spies.log.append("request stop") }
    func drain() async { spies.log.append("drain"); await spies.drain.call() }
    func end() async { spies.log.append("end"); await spies.end.call() }

    func states() async -> AsyncStream<LifecycleRecordingState> {

        spies.log.append("states")
        let states = await spies.states.call()
        return AsyncStream { output in
            for state in states { output.yield(state) }
            output.finish()
        }
    }
}

/// Holds each call until the test completes it; completing waits for the call.
private actor Spy<Value: Sendable> {

    private(set) var calls = 0
    private var pending: [CheckedContinuation<Value, Never>] = []
    private var completers: [CheckedContinuation<Void, Never>] = []

    func call() async -> Value {

        calls += 1
        return await withCheckedContinuation { continuation in
            pending.append(continuation)
            for completer in completers { completer.resume() }
            completers.removeAll()
        }
    }

    func complete(with value: Value) async {

        while pending.isEmpty { await withCheckedContinuation { completers.append($0) } }
        pending.removeFirst().resume(returning: value)
    }
}

private extension Spy where Value == Void {

    func complete() async { await complete(with: ()) }
}

private final class Log: Sendable {

    private let storage = Mutex<[String]>([])
    var values: [String] { storage.withLock { $0 } }
    func append(_ value: String) { storage.withLock { $0.append(value) } }
}
