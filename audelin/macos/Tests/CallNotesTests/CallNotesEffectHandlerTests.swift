import CallNotes
import Foundation
import Testing

@Suite(.timeLimit(.minutes(1)))
struct CallNotesEffectHandlerTests {

    @Test func makeDeliversMadeNotesWithTheirDateForItsRun() async {

        let (sut, spy) = makeSUT()
        await expect(sut, with: .make(run: 3), toDeliver: [.made(run: 3, text: "notes", date: when)], on: {
            await spy.make.complete(with: .made(text: "notes", date: when))
        })
        #expect(await spy.make.calls == 1)
        #expect(await spy.stop.calls == 0)
    }

    @Test func makeDeliversWhyMakingFailedForItsRun() async {

        let (sut, spy) = makeSUT()
        await expect(sut, with: .make(run: 3), toDeliver: [.failed(run: 3, reason: "why")], on: {
            await spy.make.complete(with: .failed(reason: "why"))
        })
    }

    @Test func stopDeliversNothingOnceMakingHasStopped() async {

        let (sut, spy) = makeSUT()
        await expect(sut, with: .stop, toDeliver: [], on: { await spy.stop.complete() })
        #expect(await spy.stop.calls == 1)
        #expect(await spy.make.calls == 0)
    }
}

private let when = Date(timeIntervalSince1970: 1_794_000_000)

private func makeSUT() -> (CallNotesEffectHandler, MakingSpy) {

    let spy = MakingSpy()
    return (CallNotesEffectHandler(making: spy), spy)
}

private struct MakingSpy: CallNotesMaking {

    let make = Spy<CallNotesOutcome>(), stop = Spy<Void>()

    func make() async -> CallNotesOutcome { await make.call() }
    func stop() async { await stop.call() }
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
