import CallDetail
import Foundation
import Testing

@Suite(.timeLimit(.minutes(1)))
struct CallDetailEffectHandlerTests {
    @Test func readDeliversTextAndMadeDate() async {
        let (sut, spy) = makeSUT()
        await expect(sut, with: .read(id: "selected call", revision: 3),
                     toDeliver: .readFinished(id: "selected call", revision: 3, result: .read(text: "# Notes", made: "10:15")),
                     on: { await spy.complete(.success((text: "# Notes", made: "10:15"))) })
        #expect(await spy.ids == ["selected call"])
    }

    @Test func readPreservesEmptyTextAndMissingDate() async {
        let (sut, spy) = makeSUT()
        await expect(sut, with: .read(id: "undated call", revision: 4),
                     toDeliver: .readFinished(id: "undated call", revision: 4, result: .read(text: "", made: nil)),
                     on: { await spy.complete(.success((text: "", made: nil))) })
        #expect(await spy.ids == ["undated call"])
    }

    @Test func absentNotesDeliverAbsent() async {
        let (sut, spy) = makeSUT()
        await expect(sut, with: .read(id: "no notes", revision: 5),
                     toDeliver: .readFinished(id: "no notes", revision: 5, result: .absent),
                     on: { await spy.complete(.success(nil)) })
        #expect(await spy.ids == ["no notes"])
    }

    @Test func failedReadDeliversLocalizedReason() async {
        let (sut, spy) = makeSUT()
        await expect(sut, with: .read(id: "unreadable call", revision: 6),
                     toDeliver: .readFinished(id: "unreadable call", revision: 6, result: .unreadable(reason: "Access denied")),
                     on: { await spy.complete(.failure(ReadFailure())) })
        #expect(await spy.ids == ["unreadable call"])
    }
}

private struct ReadFailure: LocalizedError {
    var errorDescription: String? { "Access denied" }
}

private func makeSUT() -> (CallDetailEffectHandler, NotesSpy) {
    let spy = NotesSpy()
    return (CallDetailEffectHandler(notes: { try await spy.read($0) }), spy)
}

private func expect(_ sut: CallDetailEffectHandler, with effect: CallDetailEffect, toDeliver event: CallDetailEvent,
                    on complete: () async -> Void, sourceLocation: SourceLocation = #_sourceLocation) async {
    async let delivered = sut.handle(effect)
    await complete()
    #expect(await delivered == event, sourceLocation: sourceLocation)
}

private actor NotesSpy {
    private(set) var ids: [String] = []
    private var pending: CheckedContinuation<(text: String, made: String?)?, any Error>?
    private var started: CheckedContinuation<Void, Never>?

    func read(_ id: String) async throws -> (text: String, made: String?)? {
        ids.append(id)
        return try await withCheckedThrowingContinuation { continuation in
            pending = continuation
            started?.resume()
            started = nil
        }
    }

    func complete(_ result: Result<(text: String, made: String?)?, any Error>) async {
        if pending == nil { await withCheckedContinuation { started = $0 } }
        pending?.resume(with: result)
        pending = nil
    }
}
