import Foundation
import Recordings
import Testing

struct RecordingsTests {
    @Test func S1_renamingACall() async {
        let idle = RecordingsState()
        var renaming = idle; renaming.phase = .renaming("A")
        assert(idle, .rename(id: "A", title: "New"), reducedTo: renaming)
        assert(idle, .rename(id: "A", title: "New"), effect: .rename(id: "A", title: "New"))
        var listing = idle; listing.isListing = true
        assert(renaming, .renamed("A"), reducedTo: listing)
        assert(renaming, .renamed("A"), effect: .list)
        let call = RecordedCall(id: "A", title: "New", start: .distantPast, duration: 5)
        var shown = idle; shown.calls = [call]
        assert(listing, .listed([call]), reducedTo: shown)
        assert(listing, .listed([call]), effect: nil)
        let spy = CallsSpy()
        await expect(RecordingsEffectHandler(calls: spy), with: .rename(id: "A", title: "New"), toDeliver: .renamed("A"), on: { await spy.complete(.success([])) })
        #expect(await spy.received == [.rename(id: "A", title: "New")])
    }

    @Test func S2_aFailedRenameIsNamed() async {
        var renaming = RecordingsState(); renaming.phase = .renaming("A")
        var failed = RecordingsState(); failed.failure = .init(id: "A", reason: "disk")
        assert(renaming, .renameFailed(id: "A", reason: "disk"), reducedTo: failed)
        assert(renaming, .renameFailed(id: "A", reason: "disk"), effect: nil)
        let spy = CallsSpy()
        await expect(RecordingsEffectHandler(calls: spy), with: .rename(id: "A", title: "New"), toDeliver: .renameFailed(id: "A", reason: "disk"), on: { await spy.complete(.failure(DiskFailure())) })
    }

    @Test func S3_aDeleteWaitsForTheConfirm() {
        let idle = RecordingsState()
        var asking = idle; asking.phase = .askingDelete("A")
        var askingB = idle; askingB.phase = .askingDelete("B")
        assert(idle, .askDelete("A"), reducedTo: asking)
        assert(idle, .askDelete("A"), effect: nil)
        assert(asking, .cancelDelete, reducedTo: idle)
        assert(asking, .cancelDelete, effect: nil)
        assert(asking, .askDelete("B"), reducedTo: askingB)
        assert(asking, .askDelete("B"), effect: nil)
        assert(idle, .confirmDelete, reducedTo: idle)
        assert(idle, .confirmDelete, effect: nil)
    }

    @Test func S4_aConfirmedDeleteRemovesTheCall() async {
        var asking = RecordingsState(); asking.phase = .askingDelete("A")
        var deleting = RecordingsState(); deleting.phase = .deleting("A")
        var listing = RecordingsState(); listing.isListing = true
        var failed = RecordingsState(); failed.failure = .init(id: "A", reason: "disk")
        assert(asking, .confirmDelete, reducedTo: deleting)
        assert(asking, .confirmDelete, effect: .delete("A"))
        assert(deleting, .deleted("A"), reducedTo: listing)
        assert(deleting, .deleted("A"), effect: .list)
        assert(deleting, .deleteFailed(id: "A", reason: "disk"), reducedTo: failed)
        assert(deleting, .deleteFailed(id: "A", reason: "disk"), effect: nil)
        for failed in [false, true] {
            let spy = CallsSpy()
            await expect(RecordingsEffectHandler(calls: spy), with: .delete("A"), toDeliver: failed ? .deleteFailed(id: "A", reason: "disk") : .deleted("A"), on: { await spy.complete(failed ? .failure(DiskFailure()) : .success([])) })
            #expect(await spy.received == [.delete("A")])
        }
    }

    @Test func S5_theCallBeingRecordedIsLeftAlone() {
        var active = RecordingsState(); active.recordingID = "A"
        var asking = active; asking.phase = .askingDelete("A")
        assert(active, .rename(id: "A", title: "New"), reducedTo: active)
        assert(active, .rename(id: "A", title: "New"), effect: nil)
        assert(active, .askDelete("A"), reducedTo: active)
        assert(active, .askDelete("A"), effect: nil)
        assert(asking, .confirmDelete, reducedTo: asking)
        assert(asking, .confirmDelete, effect: nil)
        var askingB = active; askingB.phase = .askingDelete("B")
        var deletingB = active; deletingB.phase = .deleting("B")
        assert(active, .askDelete("B"), reducedTo: askingB)
        assert(active, .askDelete("B"), effect: nil)
        assert(askingB, .confirmDelete, reducedTo: deletingB)
        assert(askingB, .confirmDelete, effect: .delete("B"))
        var other = active; other.phase = .renaming("B")
        assert(active, .rename(id: "B", title: "New"), reducedTo: other)
        assert(active, .rename(id: "B", title: "New"), effect: .rename(id: "B", title: "New"))
        var before = RecordingsState(); before.phase = .askingDelete("A")
        assert(before, .recordingChanged("A"), reducedTo: asking)
        assert(before, .recordingChanged("A"), effect: nil)
    }

    @Test func S6_oneActionAtATime() {
        var renaming = RecordingsState(); renaming.phase = .renaming("A")
        var deleting = RecordingsState(); deleting.phase = .deleting("A")
        var listing = RecordingsState(); listing.isListing = true
        for busy in [renaming, deleting, listing] {
            for event: RecordingsEvent in [.rename(id: "B", title: "New"), .askDelete("B"), .confirmDelete, .refresh] {
                assert(busy, event, reducedTo: busy)
                assert(busy, event, effect: nil)
            }
        }
    }

    @Test func listingDeliversAdapterDataAndFailure() async {
        let call = RecordedCall(id: "A", title: "Zoom", start: .distantPast, duration: nil)
        for failed in [false, true] {
            let spy = CallsSpy()
            await expect(RecordingsEffectHandler(calls: spy), with: .list, toDeliver: failed ? .listFailed("disk") : .listed([call]), on: { await spy.complete(failed ? .failure(DiskFailure()) : .success([call])) })
            #expect(await spy.received == [.list])
        }
    }

    @Test func failureStaysAcrossTheResultRefreshAndClearsAtTheNextAction() {
        var failed = RecordingsState(); failed.failure = .init(id: "A", reason: "disk")
        var refreshing = failed; refreshing.isListing = true
        assert(failed, .reloadAfterFailure, reducedTo: refreshing)
        assert(failed, .reloadAfterFailure, effect: .list)
        assert(refreshing, .listed([]), reducedTo: failed)
        assert(refreshing, .listed([]), effect: nil)
        var failedRefresh = failed; failedRefresh.failure = .init(id: "A", reason: "disk Не удалось обновить список: denied")
        assert(refreshing, .listFailed("denied"), reducedTo: failedRefresh)
        assert(refreshing, .listFailed("denied"), effect: nil)
        assert(failed, .clearFailure, reducedTo: RecordingsState())
        assert(failed, .clearFailure, effect: nil)
        var next = RecordingsState(); next.phase = .askingDelete("B")
        assert(failed, .askDelete("B"), reducedTo: next)
        assert(failed, .askDelete("B"), effect: nil)
    }
}

private func assert(_ state: RecordingsState, _ event: RecordingsEvent, reducedTo expected: RecordingsState, sourceLocation: SourceLocation = #_sourceLocation) {
    #expect(RecordingsReducer.reduce(state, event).0 == expected, sourceLocation: sourceLocation)
}
private func assert(_ state: RecordingsState, _ event: RecordingsEvent, effect expected: RecordingsEffect?, sourceLocation: SourceLocation = #_sourceLocation) {
    #expect(RecordingsReducer.reduce(state, event).1 == expected, sourceLocation: sourceLocation)
}
private func expect(_ sut: RecordingsEffectHandler, with effect: RecordingsEffect, toDeliver expected: RecordingsEvent,
                    on action: @escaping @Sendable () async -> Void, sourceLocation: SourceLocation = #_sourceLocation) async {
    let output = Task { var events: [RecordingsEvent] = []; for await event in sut.handle(effect) { events.append(event) }; return events }
    await action()
    #expect(await output.value == [expected], sourceLocation: sourceLocation)
}
private struct DiskFailure: LocalizedError { var errorDescription: String? { "disk" } }
private actor CallsSpy: RecordingsCalls {
    private(set) var received: [RecordingsEffect] = []
    private var answer: CheckedContinuation<[RecordedCall], any Error>?
    private var started: CheckedContinuation<Void, Never>?

    private func call(_ effect: RecordingsEffect) async throws -> [RecordedCall] {
        received.append(effect)
        return try await withCheckedThrowingContinuation {
            answer = $0
            started?.resume(); started = nil
        }
    }
    func complete(_ result: Result<[RecordedCall], any Error>) async {
        if answer == nil { await withCheckedContinuation { started = $0 } }
        answer?.resume(with: result); answer = nil
    }
    func list() async throws -> [RecordedCall] { try await call(.list) }
    func rename(id: String, title: String) async throws { _ = try await call(.rename(id: id, title: title)) }
    func delete(id: String) async throws { _ = try await call(.delete(id)) }
}
