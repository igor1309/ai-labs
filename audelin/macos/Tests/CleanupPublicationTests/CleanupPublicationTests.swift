import CleanupPublication
import Foundation
import Testing

@Suite(.timeLimit(.minutes(1)))
struct CleanupPublicationTests {
    @Test func completionThenShutdown() {
        let id = UUID()
        let state = makeState(runs: [id: .working])
        let publishing = assert(state, .completed(id, .cleaned)) { $0.runs[id] = .publishing(.cleaned) }
        let finished = assert(publishing, .published(id)) { $0.runs[id] = nil }
        assert(finished, .shutdown) { $0.stopping = true }
    }
    @Test func shutdownThenCompletion() {
        let id = UUID(), state = makeState()
        let working = assert(state, .started(id)) { $0.runs[id] = .working }
        let stopping = assert(working, .shutdown) { $0.stopping = true; $0.runs[id] = .publishing(.raw) }
        assert(stopping, .completed(id, .cleaned))
    }
    @Test func shutdownDuringPublication() {
        let id = UUID(), state = makeState()
        let working = assert(state, .started(id)) { $0.runs[id] = .working }
        let publishing = assert(working, .completed(id, .cleaned)) { $0.runs[id] = .publishing(.cleaned) }
        let stopping = assert(publishing, .shutdown) { $0.stopping = true }
        assert(stopping, .published(id)) { $0.runs[id] = nil }
    }
    @Test func startingAfterShutdownPublishesRaw() {
        let id = UUID(), state = makeState(stopping: true)
        assert(state, .started(id)) { $0.runs[id] = .publishing(.raw) }
    }

    @MainActor @Test(arguments: [false, true])
    func doerPublishesChosenOutcomeOnce(shutdownFirst: Bool) async {
        let id = UUID(), spy = PublicationsSpy()
        let events = AsyncStream<CleanupPublicationEvent>.makeStream()
        defer { events.continuation.finish() }
        let sut = CleanupPublicationDoer(publications: spy, send: { events.continuation.yield($0) })
        let state = makeState(stopping: shutdownFirst, runs: [id: .publishing(shutdownFirst ? .raw : .cleaned)])
        sut.act(on: state)
        sut.act(on: state)
        var results = events.stream.makeAsyncIterator()
        #expect(await results.next() == .published(id))
        sut.act(on: makeState())
        sut.act(on: makeState(stopping: true))
        #expect(spy.cancelled == (shutdownFirst ? [id] : []))
        #expect(spy.published == [Published(id, shutdownFirst ? .raw : .cleaned)])
    }

    @MainActor @Test func doerKeepsPublicationWhenShutdownArrivesDuringIt() async {
        let id = UUID(), spy = PublicationsSpy(hold: true)
        let events = AsyncStream<CleanupPublicationEvent>.makeStream()
        defer { events.continuation.finish() }
        let sut = CleanupPublicationDoer(publications: spy, send: { events.continuation.yield($0) })
        let state = makeState(runs: [id: .publishing(.cleaned)])
        sut.act(on: state)
        var started = spy.started.stream.makeAsyncIterator()
        #expect(await started.next() == id)
        sut.act(on: makeState(stopping: true, runs: [id: .publishing(.cleaned)]))
        spy.release()
        var results = events.stream.makeAsyncIterator()
        #expect(await results.next() == .published(id))
        #expect(spy.cancelled == [id])
        #expect(spy.published == [Published(id, .cleaned)])
    }
}

private func makeState(stopping: Bool = false, runs: [UUID: CleanupPublicationState.Phase] = [:]) -> CleanupPublicationState {
    .init(stopping: stopping, runs: runs)
}
@discardableResult private func assert(_ state: CleanupPublicationState, _ event: CleanupPublicationEvent,
                                      mutation: (inout CleanupPublicationState) -> Void = { _ in }) -> CleanupPublicationState {
    var expected = state
    mutation(&expected)
    let result = CleanupPublicationReducer().reduce(state, event)
    #expect(result == expected)
    return result
}
private struct Published: Equatable {
    let id: UUID
    let publication: Publication
    init(_ id: UUID, _ publication: Publication) { self.id = id; self.publication = publication }
}
@MainActor private final class PublicationsSpy: CleanupPublications {
    var cancelled: [UUID] = []
    var published: [Published] = []
    let started = AsyncStream<UUID>.makeStream()
    let hold: Bool
    private var continuation: CheckedContinuation<Void, Never>?
    init(hold: Bool = false) { self.hold = hold }
    func cancel(_ id: UUID) { cancelled.append(id) }
    func publish(_ id: UUID, as publication: Publication) async {
        published.append(.init(id, publication))
        if hold {
            await withCheckedContinuation { continuation in
                self.continuation = continuation
                started.continuation.yield(id)
            }
        }
    }
    func release() { continuation?.resume(); continuation = nil }
}
