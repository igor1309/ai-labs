import Machine
import Testing

@MainActor
struct MachineTests {
    @Test func effectStartsBeforeNextReduction() async {
        let effects = HeldEffects(results: [1: .value(11)])
        let record = OrderRecord()
        let machine = Machine<[Int], Event, Int>(initialState: [], reducer: { state, event in
            switch event {
            case .work(let number):
                record.entries.append("first reduction")
                return (state + [number], number)
            default:
                record.entries.append("later reduction")
                return (state, nil)
            }
        }, handler: { effect in
            record.entries.append("effect started")
            return await effects.run(effect)
        })
        defer { effects.releaseAll(); machine.end() }

        machine.send(.work(1))
        machine.send(.value(2))

        #expect(record.entries == ["first reduction", "effect started", "later reduction"])
        effects.releaseAll()
        await machine.waitForEffects()
    }

    @Test func eventsAreReducedInArrivalOrder() {
        let effects = HeldEffects(results: [:])
        let machine = makeMachine(effects)
        defer { machine.end() }

        for number in 1...10 { machine.send(.value(number)) }

        #expect(machine.state == Array(1...10))
    }

    @Test(arguments: [false, true])
    func synchronousHandlerCompletionFollowsEventsAlreadySent(_ returnsResult: Bool) async {
        let machine = Machine<[Int], Event, Int>(initialState: [], reducer: { state, event in
            switch event {
            case .work(let number): (state + [number], number)
            case .value(let number): (state + [number], nil)
            default: (state, nil)
            }
        }, handler: { _ in returnsResult ? .value(11) : nil })
        defer { machine.end() }

        machine.send(.work(1))
        machine.send(.value(2))

        #expect(machine.state == [1, 2])
        await machine.waitForEffects()
        #expect(machine.state == (returnsResult ? [1, 2, 11] : [1, 2]))
    }

    @Test func effectResultChangesState() async {
        let effects = HeldEffects(results: [1: .value(11)])
        let machine = makeMachine(effects)
        defer { effects.releaseAll(); machine.end() }

        machine.send(.work(1))
        effects.release(1)
        await machine.waitForEffects()

        #expect(machine.state == [1, 11])
        #expect(effects.output == [1])
    }

    @Test func resultThatAsksForWorkStartsTheNextEffect() async {
        let effects = HeldEffects(results: [1: .work(2), 2: .value(22)])
        let machine = makeMachine(effects)
        defer { effects.releaseAll(); machine.end() }

        machine.send(.work(1))
        effects.release(1)
        effects.release(2)
        await machine.waitForEffects()

        #expect(machine.state == [1, 2, 22])
        #expect(effects.output == [1, 2])
    }

    @Test func secondEffectFinishesWhileFirstIsHeld()async throws {
        let effects = HeldEffects(results: [1: .value(11), 2: .value(22)])
        let machine = makeMachine(effects)
        defer { effects.releaseAll(); machine.end() }
        var states = machine.states().makeAsyncIterator()
        #expect(await states.next() == [])

        machine.send(.work(1))
        try #require(await states.next() == [1])
        await effects.waitForStart(1)
        machine.send(.work(2))
        effects.release(2)

        try #require(await states.next() == [1, 2])
        #expect(await states.next() == [1, 2, 22])
        #expect(machine.state == [1, 2, 22])

        effects.release(1)
        await machine.waitForEffects()
        #expect(machine.state == [1, 2, 22, 11])
    }

    @Test func resultFollowsEventsAlreadySent() async throws {
        let effects = HeldEffects(results: [1: .value(11)])
        let machine = makeMachine(effects)
        defer { effects.releaseAll(); machine.end() }
        var states = machine.states().makeAsyncIterator()
        #expect(await states.next() == [])
        machine.send(.work(1))
        try #require(await states.next() == [1])
        await effects.waitForStart(1)

        machine.send(.value(2))
        machine.send(.value(3))
        effects.release(1)
        await machine.waitForEffects()

        #expect(machine.state == [1, 2, 3, 11])
    }

    @Test func unchangedStateIsNotPublishedAgain() async {
        let effects = HeldEffects(results: [:])
        let machine = makeMachine(effects)
        let states = machine.states()

        machine.send(.ignored)
        machine.send(.value(1))
        machine.end()

        #expect(await collect(states) == [[], [1]])
    }

    @Test func unchangedStateStillRunsEffect() async {
        let effects = HeldEffects(results: [1: .value(11)])
        let machine = makeMachine(effects)
        defer { effects.releaseAll(); machine.end() }

        machine.send(.silent(1))
        effects.release(1)
        await machine.waitForEffects()

        #expect(machine.state == [11])
        #expect(effects.output == [1])
    }

    @Test func lateSubscriberStartsWithCurrentState() async {
        let effects = HeldEffects(results: [:])
        let machine = makeMachine(effects)
        defer { machine.end() }
        for number in 1...3 { machine.send(.value(number)) }

        var states = machine.states().makeAsyncIterator()

        #expect(await states.next() == [1, 2, 3])
    }

    @Test func subscribersReceiveEveryChangeInOrder() async {
        let effects = HeldEffects(results: [:])
        let machine = makeMachine(effects)
        let first = machine.states()
        machine.send(.value(1))
        machine.send(.value(2))
        let second = machine.states()
        machine.send(.value(3))
        machine.send(.value(4))
        machine.end()

        #expect(await collect(first) == [[], [1], [1, 2], [1, 2, 3], [1, 2, 3, 4]])
        #expect(await collect(second) == [[1, 2], [1, 2, 3], [1, 2, 3, 4]])
    }

    @Test func endedMachineRejectsEventsAndWork() async {
        let effects = HeldEffects(results: [1: .value(11)])
        let machine = makeMachine(effects)
        machine.send(.value(0))
        let states = machine.states()
        machine.end()

        machine.send(.work(1))
        effects.releaseAll()
        await machine.waitForEffects()

        #expect(machine.state == [0])
        #expect(effects.output == [])
        #expect(await collect(states) == [[0]])
        #expect(await collect(machine.states()) == [[0]])
    }

    @Test func endedMachineDropsLateResultAndFurtherWork() async throws {
        let effects = HeldEffects(results: [1: .work(2), 2: .value(22)])
        let machine = makeMachine(effects)
        defer { effects.releaseAll(); machine.end() }
        var states = machine.states().makeAsyncIterator()
        #expect(await states.next() == [])
        machine.send(.work(1))
        try #require(await states.next() == [1])
        await effects.waitForStart(1)
        machine.end()

        effects.releaseAll()
        await machine.waitForEffects()

        #expect(machine.state == [1])
        #expect(effects.output == [1])
        #expect(await states.next() == nil)
    }

    @Test func endingImmediatelyAfterSendDropsResult() async {
        let effects = HeldEffects(results: [1: .value(11)])
        let machine = makeMachine(effects)
        machine.send(.work(1))
        machine.end()

        effects.releaseAll()
        await machine.waitForEffects()

        #expect(machine.state == [1])
        // Sending starts synchronous work before the caller can end the machine.
        #expect(effects.output == [1])
    }

    private func makeMachine(_ effects: HeldEffects) -> Machine<[Int], Event, Int> {
        Machine(initialState: [], reducer: { state, event in
            switch event {
            case .value(let number): (state + [number], nil)
            case .work(let number): (state + [number], number)
            case .silent(let number): (state, number)
            case .ignored: (state, nil)
            }
        }, handler: { await effects.run($0) })
    }

    private func collect(_ stream: AsyncStream<[Int]>) async -> [[Int]] {
        var states: [[Int]] = []
        for await state in stream { states.append(state) }
        return states
    }
}

private enum Event: Sendable {
    case value(Int)
    case work(Int)
    case silent(Int)
    case ignored
}

@MainActor
private final class OrderRecord {
    var entries: [String] = []
}

@MainActor
private final class HeldEffects {
    private struct Held {
        let result: Event
        let stream: AsyncStream<Event>
        let continuation: AsyncStream<Event>.Continuation
        let started: AsyncStream<Void>
        let start: AsyncStream<Void>.Continuation
    }

    private var held: [Int: Held]
    private(set) var output: [Int] = []

    init(results: [Int: Event]) {
        held = results.mapValues { result in
            let response = AsyncStream<Event>.makeStream()
            let started = AsyncStream<Void>.makeStream()
            return Held(result: result, stream: response.stream, continuation: response.continuation,
                        started: started.stream, start: started.continuation)
        }
    }

    func run(_ effect: Int) async -> Event? {
        guard let effectState = held[effect] else {
            Issue.record("Unexpected effect: \(effect)")
            return nil
        }
        output.append(effect)
        effectState.start.yield(())
        effectState.start.finish()
        var results = effectState.stream.makeAsyncIterator()
        return await results.next()
    }

    func waitForStart(_ effect: Int) async {
        guard let effectState = held[effect] else {
            Issue.record("Unknown effect: \(effect)")
            return
        }
        var starts = effectState.started.makeAsyncIterator()
        _ = await starts.next()
    }

    func release(_ effect: Int) {
        guard let effectState = held[effect] else {
            Issue.record("Unknown effect: \(effect)")
            return
        }
        effectState.continuation.yield(effectState.result)
        effectState.continuation.finish()
    }

    func releaseAll() {
        for effect in held.keys { release(effect) }
    }
}
