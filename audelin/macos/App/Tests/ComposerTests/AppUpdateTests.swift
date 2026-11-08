import AppUpdate
import BlockingTestWork
import Foundation
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
        let changes = AsyncStream<Void>.makeStream()
        let installed = Values<String>()
        let reads = Signal()
        installed.append("running")
        defer { changes.continuation.finish(); reads.end() }
        let updates = InstalledUpdates(running: "running", watch: { changes.stream },
            read: { let result = installed.all.last; reads.send(); return result },
            relaunch: { Issue.record("No tap was sent") })
        try await withComposition(updates: updates) { rig in
            await reads.next()
            try await rig.start()
            installed.append("installed")
            changes.continuation.yield(())
            await rig.clock.waitForSleep(.seconds(2))
            rig.clock.wake(.seconds(2))
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
        let changes = AsyncStream<Void>.makeStream()
        defer { changes.continuation.finish(); terminated.end() }
        let updates = InstalledUpdates(running: "running", watch: { changes.stream },
            read: { order.append("read"); return "installed" }, relaunch: { order.append("launch") })
        try await withComposition(terminate: { order.append("quit"); terminated.send() }, updates: updates) { rig in
            await waitForEntry(rig.menu, reason: nil)
            #expect(order.all == ["read"])
            #expect(rig.menu.menu.updateBadge)
            await rig.menu.perform(.restartTapped)
            await terminated.next()
            #expect(order.all == ["read", "launch", "quit"])
            #expect(rig.menu.quitting)
            let final = try await rig.state { $0.phase == .idle }
            #expect(final.phase == .idle)
        }
    }

    @Test func failedLaunchLeavesBadgeAndActiveEntryWithoutQuitting() async throws {
        let changes = AsyncStream<Void>.makeStream()
        let launches = Signal()
        defer { changes.continuation.finish(); launches.end() }
        let updates = InstalledUpdates(running: "running", watch: { changes.stream }, read: { "installed" },
            relaunch: { launches.send(); throw UpdateLaunchFailure() })
        try await withComposition(updates: updates) { rig in
            await waitForEntry(rig.menu, reason: nil)
            await rig.menu.perform(.restartTapped)
            await launches.next()
            await waitForEntry(rig.menu, reason: nil)
            #expect(rig.menu.menu.updateBadge)
            #expect(!rig.menu.quitting)
        }
    }

    @Test func bundleChangeReadsOnlyAfterInjectedQuietWait() async throws {
        let changes = AsyncStream<Void>.makeStream()
        let installed = Values<String>()
        let reads = Signal()
        installed.append("running")
        defer { changes.continuation.finish(); reads.end() }
        let updates = InstalledUpdates(running: "running", watch: { changes.stream },
            read: { let result = installed.all.last; reads.send(); return result }, relaunch: { Issue.record("No tap was sent") })
        try await withComposition(updates: updates) { rig in
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

    /// Contract test: the launch identity survives replacement of the installed Info.plist during startup.
    @Test func runningIdentityIsCapturedBeforeAsyncStartup() async throws {
        try await withComposeFolder { root in
            let bundleURL = root.appendingPathComponent("Audelin.app")
            let plist = bundleURL.appendingPathComponent("Contents/Info.plist")
            try await offPool {
                try FileManager.default.createDirectory(at: plist.deletingLastPathComponent(), withIntermediateDirectories: true)
                try buildPlist("running").write(to: plist)
            }
            let running = try await offPool {
                let bundle = try #require(Bundle(url: bundleURL))
                return runningBuildID(in: bundle)
            }
            #expect(running == "running")
            // The boundary's asynchronous startup can overlap an installation.
            try await offPool { try buildPlist("installed").write(to: plist, options: .atomic) }
            let updates = installedUpdates(running: running, pid: 123, installedBundle: bundleURL)
            let rig = try await ComposeFixture.make(root: root, updates: updates)
            await waitForEntry(rig.menu, reason: nil)
            #expect(rig.menu.menu.updateBadge)
            await rig.finish()
        }
    }
}

private func buildPlist(_ id: String) throws -> Data {
    try PropertyListSerialization.data(fromPropertyList: [
        "CFBundleIdentifier": "dev.igor1309.audelin", "CFBundlePackageType": "APPL", "AudelinBuildID": id,
    ], format: .xml, options: 0)
}

@MainActor
private func waitForEntry(_ menu: AudelinMenu, reason: String?) async {
    for await model in Observations({ menu.menu }) {
        if model.entries.first == .restart("Перезапустить для обновления", reason: reason) { return }
    }
}

private struct UpdateLaunchFailure: Error {}
