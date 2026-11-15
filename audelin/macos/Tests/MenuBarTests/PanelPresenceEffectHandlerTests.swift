import MenuBar
import Testing

@MainActor
struct PanelPresenceEffectHandlerTests {

    @Test func initDoesNotCallCollaborators() {

        let (_, spy) = makeSUT()
        #expect(spy.presented.isEmpty && spy.calls == 0 && spy.sleeps.durations.isEmpty)
    }

    @Test func showAndHideReachThePanelWithTheirReasonsAndDeliverNothing() async {

        let (sut, spy) = makeSUT()
        await expect(sut, with: [.show(.recordingBegan), .hide(.userClosed), .show(.appReopen)], toDeliver: nil)
        #expect(spy.presented == [Presented(true, .recordingBegan), Presented(false, .userClosed), Presented(true, .appReopen)])
        #expect(spy.calls == 0 && spy.sleeps.durations.isEmpty)
    }

    @Test func showCallsOpensTheCallsListAndDeliversNothing() async {

        let (sut, spy) = makeSUT()
        await expect(sut, with: [.showCalls], toDeliver: nil)
        #expect(spy.calls == 1 && spy.presented.isEmpty)
    }

    @Test func cancelDelayAloneDeliversNothing() async {

        let (sut, spy) = makeSUT()
        await expect(sut, with: [.cancelDelay], toDeliver: nil)
        #expect(spy.sleeps.durations.isEmpty)
    }

    @Test func hideAfterSleepsItsSecondsThenDeliversItsGeneration() async {

        let (sut, spy) = makeSUT()
        await expect(sut, with: [.cancelDelay, .hideAfter(seconds: 3, generation: 6)], toDeliver: .delayElapsed(6),
                     on: { await spy.sleeps.waitForSleepers(1); spy.sleeps.wake() })
        #expect(spy.sleeps.durations == [.seconds(3)])
    }

    @Test func cancelDelayDropsThePendingDelay() async {

        let (sut, spy) = makeSUT()
        let pending = sut.handle([.hideAfter(seconds: 3, generation: 6)])
        await spy.sleeps.waitForSleepers(1)
        await expect(sut, with: [.cancelDelay], toDeliver: nil)
        spy.sleeps.wake()
        #expect(await pending.collect() == [])
    }

    @Test func aNewDelayReplacesThePendingOne() async {

        let (sut, spy) = makeSUT()
        let first = sut.handle([.hideAfter(seconds: 3, generation: 6)])
        await spy.sleeps.waitForSleepers(1)
        let second = sut.handle([.hideAfter(seconds: 3, generation: 8)])
        await spy.sleeps.waitForSleepers(2)
        spy.sleeps.wake()
        #expect(await first.collect() == [])
        #expect(await second.collect() == [.delayElapsed(8)])
    }

    @Test func aFailedSleepDeliversNothing() async {

        let (sut, spy) = makeSUT()
        await expect(sut, with: [.hideAfter(seconds: 3, generation: 6)], toDeliver: nil,
                     on: { await spy.sleeps.waitForSleepers(1); spy.sleeps.fail() })
    }
}

private struct Presented: Equatable {
    let visible: Bool, reason: PanelPresence.Reason
    init(_ visible: Bool, _ reason: PanelPresence.Reason) { self.visible = visible; self.reason = reason }
}

@MainActor
private final class Spy {
    var presented: [Presented] = []
    var calls = 0
    let sleeps = Sleeps()
}

@MainActor
private func makeSUT() -> (PanelPresenceEffectHandler, Spy) {
    let spy = Spy()
    let sleeps = spy.sleeps
    let sut = PanelPresenceEffectHandler(
        present: { spy.presented.append(Presented($0, $1)) },
        showCalls: { spy.calls += 1 },
        sleep: { try await sleeps.sleep($0) })
    return (sut, spy)
}

@MainActor
private func expect(_ sut: PanelPresenceEffectHandler, with effects: [PanelPresence.Effect],
                    toDeliver expected: PanelPresence.Event?, on action: () async -> Void = {},
                    sourceLocation: SourceLocation = #_sourceLocation) async {
    let events = sut.handle(effects)
    await action()
    #expect(await events.collect() == (expected.map { [$0] } ?? []), sourceLocation: sourceLocation)
}

private extension AsyncStream {
    func collect() async -> [Element] { var all: [Element] = []; for await e in self { all.append(e) }; return all }
}

/// A sleep the test ends: `wake` returns every pending sleep, `fail` throws from it.
@MainActor
private final class Sleeps {

    private(set) var durations: [Duration] = []
    private var pending: [CheckedContinuation<Void, any Error>] = []

    nonisolated func sleep(_ duration: Duration) async throws {
        try await withCheckedThrowingContinuation { continuation in
            Task { @MainActor in
                self.durations.append(duration)
                self.pending.append(continuation)
            }
        }
    }

    func waitForSleepers(_ count: Int) async {
        for _ in 0..<1_000 where durations.count < count { await Task.yield() }
    }

    func wake() { resumeAll { $0.resume() } }
    func fail() { resumeAll { $0.resume(throwing: CancellationError()) } }

    private func resumeAll(_ resume: (CheckedContinuation<Void, any Error>) -> Void) {
        let all = pending
        pending = []
        all.forEach(resume)
    }
}
