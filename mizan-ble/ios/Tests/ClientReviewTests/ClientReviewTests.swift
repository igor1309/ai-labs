import ClientReview
import Testing

typealias Review = ClientReview

struct ClientReviewTests {
    @Test @MainActor func synchronousEffectsRunBeforeReturningTheirStreams() async {
        let cases: [(Review.Effect, Ports.Call, Review.Event)] = [
            (.seal(.confirm), .seal(.confirm), .sealed(.confirm, [9, 8, 7])),
            (.open([1, 2]), .open([1, 2]), .opened(.end)),
            (.closeSession, .close, .sessionClosed),
            (.dropLink, .drop, .linkDropped),
        ]
        for (effect, call, expected) in cases {
            let flow = Flow()
            flow.ports.opened = .end
            let stream = flow.handler.handle(effect)
            #expect(flow.ports.calls == [call])
            #expect(await collect(stream) == [expected])
        }
    }

    @Test(arguments: [Review.Decision.confirm, .decline], [false, true])
    @MainActor func writingStartsInlineAndEndsWithItsStream(_ decision: Review.Decision, _ cancel: Bool) async {
        let flow = Flow()
        let gate = AsyncStream<Void>.makeStream()
        let completed = AsyncStream<Bool>.makeStream()
        defer { gate.continuation.finish() }
        flow.ports.onWrite = {
            for await _ in gate.stream { }
            completed.continuation.yield(Task.isCancelled)
            completed.continuation.finish()
            return .accepted
        }
        let stream = flow.handler.handle(.write(decision, [9, 8, 7]))
        #expect(flow.ports.calls == [.write([9, 8, 7])])
        let consuming = Task { await collect(stream) }
        if cancel { consuming.cancel() } else { gate.continuation.finish() }
        #expect(await consuming.value == (cancel ? [] : [.written(decision, .accepted)]))
        var cancellations: [Bool] = []
        for await cancelled in completed.stream { cancellations.append(cancelled) }
        #expect(cancellations == [cancel])
    }
}

@MainActor private final class Flow {
    var state: Review.State
    let ports: Ports
    let handler: Review.EffectHandler

    init(
        host: Review.Host = .init(id: "host-7", name: "MIZAN-7F3A"),
        amount: UInt64 = 12_450, largestWrite: Int = 34
    ) {
        state = Review.State(host: host, amount: amount)
        ports = Ports(largestWrite: largestWrite)
        handler = Review.EffectHandler(session: ports, sender: ports, link: ports)
    }

    func send(_ event: Review.Event) -> Review.Effect? {
        let (next, effect) = Review.reduce(state, event)
        state = next
        return effect
    }

    func drive(_ event: Review.Event) async {
        await run(send(event))
    }

    func run(_ initial: Review.Effect?) async {
        guard let initial else { return }
        for await result in handler.handle(initial) {
            await drive(result)
        }
    }
}

@MainActor private final class Ports: Review.Session, Review.Sender, Review.Link {
    enum Call: Equatable {
        case seal(Review.Decision), write([UInt8]), open([UInt8]), close, drop
    }
    let largestWrite: Int
    var calls: [Call] = []
    var sealed: [UInt8] = [9, 8, 7]
    var opened: Review.Message?
    var writeResult: Review.WriteResult = .accepted
    var holdWrite = false
    var onWrite: (() async -> Review.WriteResult)?
    private var writeAnswer: CheckedContinuation<Review.WriteResult, Never>?
    private var writeWaiter: CheckedContinuation<Void, Never>?

    init(largestWrite: Int) {
        self.largestWrite = largestWrite
    }

    func seal(_ decision: Review.Decision) -> [UInt8] {
        calls.append(.seal(decision))
        return sealed
    }

    func open(_ bytes: [UInt8]) -> Review.Message? {
        calls.append(.open(bytes))
        return opened
    }

    func write(_ bytes: [UInt8]) async -> Review.WriteResult {
        calls.append(.write(bytes))
        guard bytes.count <= largestWrite else { return .refused }
        if let onWrite { return await onWrite() }
        writeWaiter?.resume()
        writeWaiter = nil
        if holdWrite {
            return await withCheckedContinuation { writeAnswer = $0 }
        }
        return writeResult
    }

    func waitForWrite() async {
        if calls.contains(where: { if case .write = $0 { true } else { false } }) { return }
        await withCheckedContinuation { writeWaiter = $0 }
    }

    func finishWrite(_ result: Review.WriteResult) {
        writeAnswer?.resume(returning: result)
        writeAnswer = nil
    }

    func close() { calls.append(.close) }
    func drop() { calls.append(.drop) }
}

@MainActor
private func collect(_ stream: AsyncStream<Review.Event>) async -> [Review.Event] {
    var events: [Review.Event] = []
    for await event in stream { events.append(event) }
    return events
}
