import AppUpdate
import Synchronization
import Testing

@Suite(.timeLimit(.minutes(1)))
struct EffectHandlerTests {
    @Test func watchStartsBeforeFirstReadAndForwardsChanges() async {
        let (sut, spies) = makeSUT()
        let changes = AsyncStream<Void>.makeStream()
        let events = collect(sut.handle(.watch))
        await spies.watch.complete(with: changes.stream)
        await spies.read.complete(with: .build("initial"))
        changes.continuation.yield(())
        changes.continuation.yield(())
        changes.continuation.finish()
        #expect(await events.value == [.read(.build("initial")), .bundleChanged, .bundleChanged])
        #expect(spies.log.values == ["watch", "read"])
    }

    @Test func watchDeliversUnreadableFirstRead() async {
        let (sut, spies) = makeSUT()
        await expect(sut, with: .watch, toDeliver: .read(.unreadable), on: {
            await spies.watch.complete(with: AsyncStream { $0.finish() })
            await spies.read.complete(with: .unreadable)
        })
    }

    @Test(arguments: [Read.build("installed"), .unreadable])
    func readWaitsForTwoSecondsOfQuiet(result: Read) async {
        let (sut, spies) = makeSUT()
        await expect(sut, with: .read, toDeliver: .read(result), on: {
            await spies.clock.waitForCall()
            #expect(spies.log.values == ["sleep 2.0 seconds"])
            await spies.clock.complete(with: ())
            await spies.read.complete(with: result)
        })
        #expect(spies.log.values == ["sleep 2.0 seconds", "read"])
    }

    @Test func secondChangeSupersedesEarlierQuietWait() async {
        let (sut, spies) = makeSUT()
        let first = collect(sut.handle(.read))
        await spies.clock.waitForCall()
        let second = collect(sut.handle(.read))
        await spies.clock.complete(with: ())
        await spies.clock.complete(with: ())
        await spies.read.complete(with: .build("latest"))
        #expect(await first.value.isEmpty)
        #expect(await second.value == [.read(.build("latest"))])
        #expect(await spies.read.calls == 1)
    }

    @Test func secondChangeDiscardsAnAlreadyRunningRead() async {
        let (sut, spies) = makeSUT()
        let first = collect(sut.handle(.read))
        await spies.clock.complete(with: ())
        await spies.read.waitForCall()
        let second = collect(sut.handle(.read))
        await spies.read.complete(with: .build("stale"))
        await spies.clock.complete(with: ())
        await spies.read.complete(with: .build("latest"))
        #expect(await first.value.isEmpty)
        #expect(await second.value == [.read(.build("latest"))])
    }

    @Test func clockCancellationSkipsRead() async {
        let (sut, spies) = makeSUT()
        let events = collect(sut.handle(.read))
        await spies.clock.waitForCall()
        sut.end()
        await spies.clock.complete(with: ())
        #expect(await events.value.isEmpty)
        #expect(await spies.read.calls == 0)
    }

    @Test func relaunchDeliversStartedOnlyAfterLaunch() async {
        let (sut, spies) = makeSUT()
        await expect(sut, with: .relaunch, toDeliver: .relaunchStarted, on: {
            await spies.launch.complete(with: true)
        })
        #expect(spies.log.values == ["relaunch"])
    }

    @Test func failedRelaunchDeliversFailure() async {
        let (sut, spies) = makeSUT()
        await expect(sut, with: .relaunch, toDeliver: .relaunchFailed, on: {
            await spies.launch.complete(with: false)
        })
        #expect(spies.log.values == ["relaunch"])
    }

    @Test func terminateCallsOnlyQuitPortAndDeliversNoEvent() async {
        let (sut, spies) = makeSUT()
        let events = collect(sut.handle(.terminate))
        await spies.terminate.complete(with: ())
        #expect(await events.value.isEmpty)
        #expect(spies.log.values == ["terminate"])
    }

    @Test func endStopsWatchingAndRejectsMoreWork() async {
        let (sut, spies) = makeSUT()
        let events = collect(sut.handle(.watch))
        let changes = AsyncStream<Void>.makeStream()
        await spies.watch.complete(with: changes.stream)
        await spies.read.complete(with: .unreadable)
        sut.end()
        #expect(await events.value.allSatisfy { $0 == .read(.unreadable) })
        #expect(await collect(sut.handle(.read)).value.isEmpty)
        #expect(await spies.clock.calls == 0)
    }
}

private func expect(_ sut: EffectHandler, with effect: Effect, toDeliver expected: Event,
                    on action: @Sendable () async -> Void, sourceLocation: SourceLocation = #_sourceLocation) async {
    let events = collect(sut.handle(effect))
    await action()
    #expect(await events.value == [expected], sourceLocation: sourceLocation)
}

private func collect(_ stream: AsyncStream<Event>) -> Task<[Event], Never> {
    Task {
        var events: [Event] = []
        for await event in stream { events.append(event) }
        return events
    }
}

private struct Spies: Sendable {
    let log = Log()
    let watch = Spy<AsyncStream<Void>>()
    let read = Spy<Read>()
    let clock = Spy<Void>()
    let launch = Spy<Bool>()
    let terminate = Spy<Void>()
}

private func makeSUT() -> (EffectHandler, Spies) {
    let spies = Spies()
    return (EffectHandler(watch: { spies.log.append("watch"); return await spies.watch.call() },
        read: { spies.log.append("read"); return await spies.read.call() },
        relaunch: {
            spies.log.append("relaunch")
            if await !spies.launch.call() { throw LaunchFailed() }
        }, terminate: { spies.log.append("terminate"); await spies.terminate.call() },
        sleep: { duration in spies.log.append("sleep \(duration)"); await spies.clock.call() }), spies)
}

private struct LaunchFailed: Error {}

private final class Log: Sendable {
    private let storage = Mutex<[String]>([])
    var values: [String] { storage.withLock { $0 } }
    func append(_ value: String) { storage.withLock { $0.append(value) } }
}

private actor Spy<Value: Sendable> {
    private(set) var calls = 0
    private var pending: [CheckedContinuation<Value, Never>] = []
    private var waiting: [CheckedContinuation<Void, Never>] = []

    func call() async -> Value {
        calls += 1
        return await withCheckedContinuation { continuation in
            pending.append(continuation)
            for waiter in waiting { waiter.resume() }
            waiting.removeAll()
        }
    }
    func waitForCall() async {
        while pending.isEmpty { await withCheckedContinuation { waiting.append($0) } }
    }
    func complete(with value: Value) async {
        await waitForCall()
        pending.removeFirst().resume(returning: value)
    }
}
