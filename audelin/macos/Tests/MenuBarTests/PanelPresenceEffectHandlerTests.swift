import MenuBar
import Testing

@MainActor
struct PanelPresenceEffectHandlerTests {

    @Test func showAndHideReachThePanelWithTheirReasons() {

        let rig = Rig()
        rig.handler.handle(.show(.recordingBegan), send: rig.send)
        rig.handler.handle(.hide(.userClosed), send: rig.send)
        rig.handler.handle(.show(.appReopen), send: rig.send)
        #expect(rig.presented == [Presented(true, .recordingBegan), Presented(false, .userClosed), Presented(true, .appReopen)])
        #expect(rig.calls == 0 && rig.events.isEmpty)
    }

    @Test func showCallsOpensTheCallsList() {

        let rig = Rig()
        rig.handler.handle(.showCalls, send: rig.send)
        #expect(rig.calls == 1 && rig.presented.isEmpty)
    }

    @Test func hideAfterSleepsItsSecondsThenSendsItsGeneration() async {

        let rig = Rig()
        rig.handler.handle(.hideAfter(seconds: 3, generation: 6), send: rig.send)
        await rig.sleeps.waitForSleepers(1)
        #expect(rig.sleeps.durations == [.seconds(3)])
        #expect(rig.events.isEmpty)
        rig.sleeps.wake()
        await rig.settle { !rig.events.isEmpty }
        #expect(rig.events == [.delayElapsed(6)])
    }

    @Test func cancelDelayDropsThePendingDelay() async {

        let rig = Rig()
        rig.handler.handle(.hideAfter(seconds: 3, generation: 6), send: rig.send)
        await rig.sleeps.waitForSleepers(1)
        rig.handler.handle(.cancelDelay, send: rig.send)
        rig.sleeps.wake()
        await rig.settle { false }
        #expect(rig.events.isEmpty)
    }

    @Test func aNewDelayReplacesThePendingOne() async {

        let rig = Rig()
        rig.handler.handle(.hideAfter(seconds: 3, generation: 6), send: rig.send)
        await rig.sleeps.waitForSleepers(1)
        rig.handler.handle(.hideAfter(seconds: 3, generation: 8), send: rig.send)
        await rig.sleeps.waitForSleepers(2)
        rig.sleeps.wake()
        await rig.settle { rig.events.count > 1 }
        #expect(rig.events == [.delayElapsed(8)])
    }

    @Test func aFailedSleepSendsNothing() async {

        let rig = Rig()
        rig.handler.handle(.hideAfter(seconds: 3, generation: 6), send: rig.send)
        await rig.sleeps.waitForSleepers(1)
        rig.sleeps.fail()
        await rig.settle { false }
        #expect(rig.events.isEmpty)
    }

    /// Reducer and handler together: an ended recording hides the panel once the delay elapses.
    @Test func endedRecordingHidesThePanelAfterTheDelay() async {

        let rig = Rig()
        var state = PanelPresence()
        func receive(_ event: PanelPresence.Event) {
            let (next, effects) = PanelPresence.reduce(state, event)
            state = next
            for effect in effects { rig.handler.handle(effect) { receive($0) } }
        }
        receive(.recordingChanged(1))
        receive(.recordingChanged(nil))
        await rig.sleeps.waitForSleepers(1)
        #expect(state.visible)
        rig.sleeps.wake()
        await rig.settle { !state.visible }
        #expect(!state.visible)
        #expect(rig.presented == [Presented(true, .recordingBegan), Presented(false, .recordingEnded)])
    }
}

private struct Presented: Equatable {
    let visible: Bool, reason: PanelPresence.Reason
    init(_ visible: Bool, _ reason: PanelPresence.Reason) { self.visible = visible; self.reason = reason }
}

@MainActor
private final class Rig {

    var presented: [Presented] = []
    var calls = 0
    var events: [PanelPresence.Event] = []
    let sleeps = Sleeps()
    private(set) var handler: PanelPresenceEffectHandler!

    init() {
        let sleeps = sleeps
        handler = PanelPresenceEffectHandler(
            present: { [unowned self] in presented.append(Presented($0, $1)) },
            showCalls: { [unowned self] in calls += 1 },
            sleep: { try await sleeps.sleep($0) })
    }

    var send: (PanelPresence.Event) -> Void { { [unowned self] in events.append($0) } }

    func settle(until done: () -> Bool) async {
        for _ in 0..<200 where !done() { await Task.yield() }
    }
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
