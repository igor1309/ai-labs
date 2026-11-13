import CallNotes
import Foundation
import Testing

struct CallNotesEffectHandlerTests {

    @Test func init_callsNoCollaborator() {

        let (_, load, cancel) = makeSUT()
        #expect(load.callCount == 0)
        #expect(cancel.callCount == 0)
    }

    @Test func load_callsLoadOnly() {

        let (sut, load, cancel) = makeSUT()
        sut.handleEffect(.load) { _ in }
        #expect(load.callCount == 1)
        #expect(cancel.callCount == 0)
    }

    @Test func load_deliversNotes_onLoadSuccess() {

        let (sut, load, _) = makeSUT()
        expect(sut, with: .load, toDeliver: [.loaded(.success(loaded))]) { load.complete(with: .success(loaded)) }
    }

    @Test func load_deliversFailure_onLoadFailure() {

        let (sut, load, _) = makeSUT()
        let failure = Failure(reason: "why")
        expect(sut, with: .load, toDeliver: [.loaded(.failure(failure))]) { load.complete(with: .failure(failure)) }
    }

    @Test func cancel_callsCancelOnly() {

        let (sut, load, cancel) = makeSUT()
        sut.handleEffect(.cancel) { _ in }
        #expect(cancel.callCount == 1)
        #expect(load.callCount == 0)
    }

    @Test func cancel_deliversNothing() {

        let (sut, _, _) = makeSUT()
        expect(sut, with: .cancel, toDeliver: []) {}
    }
}

private let loaded = CallNotesEvent.Loaded(text: "notes", date: Date(timeIntervalSince1970: 1_794_000_000))

private typealias LoadSpy = Spy<Result<CallNotesEvent.Loaded, Failure>>

private func makeSUT() -> (CallNotesEffectHandler, LoadSpy, CancelSpy) {

    let load = LoadSpy(), cancel = CancelSpy()
    return (CallNotesEffectHandler(load: load.process, cancel: cancel.call), load, cancel)
}

private func expect(
    _ sut: CallNotesEffectHandler, with effect: CallNotesEffect, toDeliver expected: [CallNotesEvent],
    on action: () -> Void, sourceLocation: SourceLocation = #_sourceLocation
) {

    var events: [CallNotesEvent] = []
    sut.handleEffect(effect) { events.append($0) }
    action()
    #expect(events == expected, sourceLocation: sourceLocation)
}

/// Keeps each call's completion; `complete(with:)` answers the oldest.
private final class Spy<Response> {

    private var completions: [(Response) -> Void] = []
    var callCount: Int { completions.count }

    func process(_ completion: @escaping (Response) -> Void) { completions.append(completion) }
    func complete(with response: Response, at index: Int = 0) { completions[index](response) }
}

private final class CancelSpy {

    private(set) var callCount = 0
    func call() { callCount += 1 }
}
