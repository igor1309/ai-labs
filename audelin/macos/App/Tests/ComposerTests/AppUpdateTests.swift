import AppUpdate
import MenuBar
import Observation
import Recording
import Testing
@testable import Composer

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct AppUpdateCompositionTests {
    @Test func everyRecordingPhaseMapsToItsRestartGate() {
        for (phase, gate): (RecordingState.Phase, AppUpdate.Call) in [
            (.idle, .idle), (.beginning, .inCall), (.recording, .inCall), (.ending, .finishingSave),
        ] { #expect(updateCall(phase) == gate) }
    }

    @Test func installDuringRecordingDisablesEntryUntilSaveFinishes() async throws {
        try await withComposition { rig in
            try await rig.start()
            let changes = AsyncStream<Void>.makeStream()
            defer { changes.continuation.finish() }
            rig.menu.installUpdates(.init(running: "running", watch: { changes.stream }, read: { "installed" },
                relaunch: { Issue.record("No tap was sent") }), sleep: rig.clock.sleep)
            await waitForEntry(rig.menu, reason: "Доступно после звонка")
            #expect(rig.menu.menu.updateBadge)
            await rig.menu.perform(.restartTapped)
            try await rig.stop()
            await waitForEntry(rig.menu, reason: nil)
            #expect(rig.menu.menu.updateBadge)
            #expect(!rig.menu.quitting)
        }
    }

    @Test func restartTapRelaunchesThenUsesNormalQuitPath() async throws {
        let order = Values<String>()
        let terminated = Signal()
        try await withComposition(terminate: { order.append("quit"); terminated.send() }) { rig in
            let changes = AsyncStream<Void>.makeStream()
            defer { changes.continuation.finish(); terminated.end() }
            rig.menu.installUpdates(.init(running: "running", watch: { changes.stream }, read: { "installed" },
                relaunch: { order.append("launch") }), sleep: rig.clock.sleep)
            await waitForEntry(rig.menu, reason: nil)
            await rig.menu.perform(.restartTapped)
            await terminated.next()
            #expect(order.all == ["launch", "quit"])
            #expect(rig.menu.quitting)
            let final = try await rig.state { $0.phase == .idle }
            #expect(final.phase == .idle)
        }
    }

    @Test func failedLaunchLeavesBadgeAndActiveEntryWithoutQuitting() async throws {
        try await withComposition { rig in
            let changes = AsyncStream<Void>.makeStream()
            let launches = Signal()
            defer { changes.continuation.finish(); launches.end() }
            rig.menu.installUpdates(.init(running: "running", watch: { changes.stream }, read: { "installed" },
                relaunch: { launches.send(); throw UpdateLaunchFailure() }), sleep: rig.clock.sleep)
            await waitForEntry(rig.menu, reason: nil)
            await rig.menu.perform(.restartTapped)
            await launches.next()
            await waitForEntry(rig.menu, reason: nil)
            #expect(rig.menu.menu.updateBadge)
            #expect(!rig.menu.quitting)
        }
    }

    @Test func bundleChangeReadsOnlyAfterInjectedQuietWait() async throws {
        try await withComposition { rig in
            let changes = AsyncStream<Void>.makeStream()
            let installed = Values<String>()
            let reads = Signal()
            installed.append("running")
            defer { changes.continuation.finish(); reads.end() }
            rig.menu.installUpdates(.init(running: "running", watch: { changes.stream },
                read: { let result = installed.all.last; reads.send(); return result }, relaunch: { Issue.record("No tap was sent") }), sleep: rig.clock.sleep)
            await reads.next()
            installed.append("replacement")
            changes.continuation.yield(())
            await rig.clock.waitForSleep(.seconds(2))
            #expect(!rig.menu.menu.updateBadge)
            rig.clock.wake(.seconds(2))
            await waitForEntry(rig.menu, reason: nil)
            #expect(rig.menu.menu.updateBadge)
        }
    }
}

@MainActor
private func waitForEntry(_ menu: AudelinMenu, reason: String?) async {
    for await model in Observations({ menu.menu }) {
        if model.entries.first == .restart("Перезапустить для обновления", reason: reason) { return }
    }
}

private struct UpdateLaunchFailure: Error {}
