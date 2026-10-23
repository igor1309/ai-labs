import Synchronization
import Testing
@testable import Machine

@Suite(.timeLimit(.minutes(1)))
struct MachineTests {

    @Test func eventsAreReducedInArrivalOrder() async {

        await withRig { rig in

            for number in 1...10 { rig.machine.send(.number(number)) }
            #expect(await rig.machine.snapshot() == (1...10).map(Event.number))
            await rig.machine.end()
        }
    }

    @Test func effectResultChangesState() async throws {

        try await withRig { rig in

            let states = await rig.machine.states()
            var updates = states.makeAsyncIterator()
            #expect(await updates.next() == [])
            rig.machine.send(.work(1))
            try #require(await rig.machine.snapshot() == [.work(1)])
            await rig.dependency.release(1, returning: .number(2))
            #expect(await updates.next() == [.work(1)])
            #expect(await updates.next() == [.work(1), .number(2)])
            await rig.machine.waitForEffects()
            #expect(rig.dependency.output == ["work 1"])
            await rig.machine.end()
        }
    }

    @Test func effectResultsChainFurtherWork() async throws {

        let gate = Turns()
        try await withRig(turns: gate) { rig in

            rig.machine.send(.work(1))
            for id in 1...3 {
                await gate.advance()
                await gate.advance()
                try #require(await rig.machine.snapshot() == (1...id).map(Event.work))
                // Hold consumption until the effect has enqueued its result.
                await gate.waitUntilHeld()
                #expect(rig.dependency.output == (1..<id).map { "work \($0)" })
                let result: Event = id < 3 ? .work(id + 1) : .number(4)
                await rig.dependency.release(id, returning: result)
                await rig.machine.waitForEffects()
                #expect(rig.dependency.output == (1...id).map { "work \($0)" })
            }
            await gate.open()
            #expect(await rig.machine.snapshot() == [.work(1), .work(2), .work(3), .number(4)])
            await rig.machine.end()
        }
    }

    @Test func laterEffectFinishesWhileFirstIsHeld() async throws {

        try await withRig { rig in

            rig.machine.send(.work(1))
            try #require(await rig.machine.snapshot() == [.work(1)])
            await rig.dependency.waitUntilHeld(1)
            var updates = await rig.machine.states().makeAsyncIterator()
            #expect(await updates.next() == [.work(1)])
            rig.machine.send(.work(2))
            try #require(await rig.machine.snapshot() == [.work(1), .work(2)])
            #expect(await updates.next() == [.work(1), .work(2)])
            await rig.dependency.release(2, returning: .number(3))
            #expect(await updates.next() == [.work(1), .work(2), .number(3)])
            #expect(rig.dependency.output == ["work 2"])
            await rig.dependency.release(1, returning: .number(4))
            await rig.machine.waitForEffects()
            #expect(await rig.machine.snapshot() == [.work(1), .work(2), .number(3), .number(4)])
            await rig.machine.end()
        }
    }

    @Test func resultQueuesBehindEventsAlreadySent() async throws {

        let gate = Turns()
        try await withRig(turns: gate) { rig in

            let machine = rig.machine
            let dependency = rig.dependency
            machine.send(.work(1))
            await gate.advance()
            await gate.advance()
            try #require(await machine.snapshot() == [.work(1)])
            await dependency.waitUntilHeld(1)
            // The next turn is held before it can take an event from the queue.
            await gate.waitUntilHeld()
            machine.send(.number(2))
            machine.send(.number(3))
            await dependency.release(1, returning: .number(4))
            await machine.waitForEffects()
            await gate.open()
            #expect(await machine.snapshot() == [.work(1), .number(2), .number(3), .number(4)])
            #expect(dependency.output == ["work 1"])
            await machine.end()
        }
    }

    @Test func unchangedStateIsNotPublishedAgain() async {

        await withRig { rig in

            let states = await rig.machine.states()
            rig.machine.send(.ignored)
            rig.machine.send(.number(1))
            #expect(await rig.machine.snapshot() == [.number(1)])
            await rig.machine.end()
            var received: [[Event]] = []
            for await state in states { received.append(state) }
            #expect(received == [[], [.number(1)]])
        }
    }

    @Test func equalStateIsKeptForTheNextReduction() async {

        let machine = Machine<Revision, Int, Int>(
            initial: Revision(visible: 0, pending: 0),
            reduce: { state, event in
                if event == 0 {
                    return (Revision(visible: state.visible, pending: state.pending + 1), nil)
                }
                return (Revision(visible: state.pending, pending: state.pending), nil)
            },
            handle: { $0 }
        )
        let states = await machine.states()
        machine.send(0)
        machine.send(1)
        #expect(await machine.snapshot().visible == 1)
        await machine.end()
        var visible: [Int] = []
        for await state in states { visible.append(state.visible) }
        #expect(visible == [0, 1])
    }

    @Test func unchangedStateStillRunsEffect() async throws {

        try await withRig { rig in

            rig.machine.send(.quietWork(1))
            #expect(await rig.machine.snapshot() == [])
            rig.machine.send(.number(2))
            try #require(await rig.machine.snapshot() == [.number(2)])
            await rig.dependency.release(1, returning: .number(3))
            await rig.machine.waitForEffects()
            #expect(await rig.machine.snapshot() == [.number(2), .number(3)])
            #expect(rig.dependency.output == ["work 1"])
            await rig.machine.end()
        }
    }

    @Test func lateSubscriberStartsWithCurrentState() async {

        await withRig { rig in

            for number in 1...3 { rig.machine.send(.number(number)) }
            #expect(await rig.machine.snapshot() == (1...3).map(Event.number))
            var updates = await rig.machine.states().makeAsyncIterator()
            #expect(await updates.next() == (1...3).map(Event.number))
            await rig.machine.end()
        }
    }

    @Test func everySubscriberReceivesEveryChange() async throws {

        try await withRig { rig in

            var first = await rig.machine.states().makeAsyncIterator()
            #expect(await first.next() == [])
            for number in 1...2 { rig.machine.send(.number(number)) }
            try #require(await rig.machine.snapshot() == (1...2).map(Event.number))
            var second = await rig.machine.states().makeAsyncIterator()
            #expect(await second.next() == (1...2).map(Event.number))
            for number in 3...4 { rig.machine.send(.number(number)) }
            try #require(await rig.machine.snapshot() == (1...4).map(Event.number))
            for number in 1...4 {
                #expect(await first.next() == (1...number).map(Event.number))
            }
            for number in 3...4 {
                #expect(await second.next() == (1...number).map(Event.number))
            }
            let before = (1...4).map(Event.number) + [.work(5)]
            rig.machine.send(.work(5))
            await rig.dependency.waitUntilHeld(5)
            #expect(await first.next() == before)
            #expect(await second.next() == before)
            #expect(rig.dependency.output == [])
            await rig.dependency.release(5, returning: .number(6))
            #expect(await first.next() == before + [.number(6)])
            #expect(await second.next() == before + [.number(6)])
            await rig.machine.waitForEffects()
            #expect(rig.dependency.output == ["work 5"])
            await rig.machine.end()
        }
    }

    @Test func endedMachineIgnoresEventsAndStartsNoWork() async throws {

        try await withRig { rig in

            rig.machine.send(.number(1))
            try #require(await rig.machine.snapshot() == [.number(1)])
            await rig.machine.end()
            rig.machine.send(.work(2))
            await rig.machine.waitForEffects()
            await rig.dependency.releaseAll()
            #expect(await rig.machine.snapshot() == [.number(1)])
            #expect(rig.dependency.output == [])
            var updates = await rig.machine.states().makeAsyncIterator()
            #expect(await updates.next() == [.number(1)])
            #expect(await updates.next() == nil)
        }
    }

    @Test func endedMachineDropsQueuedEventWithoutWork() async throws {

        let gate = Turns()
        try await withRig(turns: gate) { rig in

            rig.machine.send(.number(1))
            await gate.advance()
            await gate.advance()
            try #require(await rig.machine.snapshot() == [.number(1)])
            await gate.waitUntilHeld()
            rig.machine.send(.work(2))
            await rig.machine.end()
            await gate.advance()
            // A terminated snapshot bypasses the queue, so wait for consumption first.
            await gate.waitUntilHeld()
            try #require(await rig.machine.snapshot() == [.number(1)])
            await rig.dependency.releaseAll()
            await rig.machine.waitForEffects()
            #expect(rig.dependency.output == [])
        }
    }

    @Test func endedMachineDropsLateResultWithoutMoreWork() async throws {

        try await withRig { rig in

            rig.machine.send(.work(1))
            try #require(await rig.machine.snapshot() == [.work(1)])
            await rig.dependency.waitUntilHeld(1)
            await rig.machine.end()
            await rig.dependency.release(1, returning: .work(2))
            await rig.machine.waitForEffects()
            await rig.dependency.releaseAll()
            #expect(await rig.machine.snapshot() == [.work(1)])
            #expect(rig.dependency.output == ["work 1"])
        }
    }
}

private enum Event: Equatable, Sendable {

    case number(Int)
    case work(Int)
    case quietWork(Int)
    case ignored
}

private typealias TestMachine = Machine<[Event], Event, Int>

private func reduce(_ state: [Event], _ event: Event) -> ([Event], Int?) {

    switch event {
    case .number: (state + [event], nil)
    case .work(let id): (state + [event], id)
    case .quietWork(let id): (state, id)
    case .ignored: (state, nil)
    }
}

private struct Rig {

    let dependency = Dependency()
    let machine: TestMachine

    init(turns: Turns?) {

        let dependency = dependency
        if let turns {
            machine = TestMachine(
                initial: [], reduce: reduce, handle: { await dependency.perform($0) },
                beforeNext: { await turns.next() }
            )
        } else {
            machine = TestMachine(initial: [], reduce: reduce, handle: { await dependency.perform($0) })
        }
    }

    func finish() async {

        await machine.end()
        await dependency.finish()
        await machine.waitForEffects()
    }
}

private func withRig(
    turns: Turns? = nil,
    _ test: (Rig) async throws -> Void
) async rethrows {

    let rig = Rig(turns: turns)
    do {
        try await test(rig)
    } catch {
        await turns?.open()
        await rig.finish()
        throw error
    }
    await turns?.open()
    await rig.finish()
}

private actor Dependency {

    nonisolated private let written = Mutex<[String]>([])
    private var held: [Int: CheckedContinuation<Event, Never>] = [:]
    private var arrivals: [Int: [UInt64: CheckedContinuation<Void, Never>]] = [:]
    private var nextWaiter: UInt64 = 0
    private var finished = false

    nonisolated var output: [String] {

        written.withLock { $0 }
    }

    func perform(_ id: Int) async -> Event {

        if finished { return .ignored }
        let result = await withCheckedContinuation { continuation in
            held[id] = continuation
            for waiter in (arrivals.removeValue(forKey: id) ?? [:]).values { waiter.resume() }
        }
        written.withLock { $0.append("work \(id)") }
        return result
    }

    func waitUntilHeld(_ id: Int) async {

        if held[id] != nil { return }
        nextWaiter += 1
        let waiter = nextWaiter
        await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                if Task.isCancelled {
                    continuation.resume()
                } else {
                    arrivals[id, default: [:]][waiter] = continuation
                }
            }
        } onCancel: {
            Task { await self.stopWaiting(waiter, for: id) }
        }
    }

    private func stopWaiting(_ waiter: UInt64, for id: Int) {

        arrivals[id]?.removeValue(forKey: waiter)?.resume()
    }

    func release(_ id: Int, returning event: Event) async {

        await waitUntilHeld(id)
        held.removeValue(forKey: id)?.resume(returning: event)
    }

    func finish() {

        finished = true
        releaseAll()
    }

    func releaseAll() {

        let pending = held
        held.removeAll()
        for (id, continuation) in pending { continuation.resume(returning: .number(id)) }
    }
}

private actor Turns {

    private var permits = 0
    private var opened = false
    private var waiting: CheckedContinuation<Void, Never>?
    private var observers: [UInt64: CheckedContinuation<Void, Never>] = [:]
    private var nextObserver: UInt64 = 0

    func next() async {

        if opened { return }
        if permits > 0 {
            permits -= 1
            return
        }
        await withCheckedContinuation { continuation in
            waiting = continuation
            for observer in observers.values { observer.resume() }
            observers.removeAll()
        }
    }

    func advance() {

        if let waiting {
            self.waiting = nil
            waiting.resume()
        } else {
            permits += 1
        }
    }

    func waitUntilHeld() async {

        if waiting != nil { return }
        nextObserver += 1
        let observer = nextObserver
        await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                if Task.isCancelled {
                    continuation.resume()
                } else {
                    observers[observer] = continuation
                }
            }
        } onCancel: {
            Task { await self.stopObserving(observer) }
        }
    }

    private func stopObserving(_ observer: UInt64) {

        observers.removeValue(forKey: observer)?.resume()
    }

    func open() {

        opened = true
        waiting?.resume()
        waiting = nil
    }
}

private struct Revision: Equatable, Sendable {

    let visible: Int
    let pending: Int

    static func == (lhs: Self, rhs: Self) -> Bool {

        lhs.visible == rhs.visible
    }
}
