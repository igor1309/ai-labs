import Testing
import Foundation
import HostUI
@testable import Root

@Suite @MainActor struct AppRootTests {
    @Test(arguments: Side.allCases) func launchUsesDeviceRole(_ side: Side) {
        let h = Harness()
        defer { h.finish() }
        let root = AppRoot(radios: h.pair, launchSide: side, clock: h.clock, store: h.store, log: h.log)
        #expect(root.state.side == side)
        #expect(root.modeSwitchState.side == side)
        #expect(root.isAtRest && root.modeSwitchState.isEnabled)
        #expect(h.host.calls.isEmpty && h.client.calls.isEmpty)
        #expect(h.log.entries == [
            .init(category: .hostRadio, message: "built"),
            .init(category: .clientRadio, message: "built"),
            .init(category: .mode, message: "\(side == .host ? "host" : "client") built"),
        ] + (side == .host ? initialHostLogs : initialClientLogs))
    }

    @Test(arguments: Side.allCases) func switchAtRest(_ side: Side) {
        let h = Harness()
        defer { h.finish() }
        let root = AppRoot(radios: h.pair, launchSide: side, clock: h.clock, store: h.store, log: h.log)
        let other: Side = side == .host ? .client : .host
        root.choose(other)
        #expect(root.state.side == other)
        #expect(root.isAtRest && root.modeSwitchState.isEnabled)
        #expect(h.log.entries.last { $0.category == .mode } == .init(category: .mode, message: "\(other == .host ? "host" : "client") built"))
    }

    @Test func switchIgnoredWhileBusy() async throws {
        let h = Harness()
        defer { h.finish() }
        let root = AppRoot(radios: h.pair, launchSide: .host, clock: h.clock, store: h.store, log: h.log)
        let host = try #require(root.host)
        h.host.continuation.yield(.bluetoothState(.poweredOn))
        await until { host.amount?.state.bluetooth == .available }
        host.event(.digit(1))
        await until { host.screen.amount == "1" }
        host.event(.lockAndBroadcast)
        await until { !root.state.isAtRest }
        let before = h.log.entries
        root.choose(.client)
        #expect(root.state.side == .host)
        #expect(!root.modeSwitchState.isEnabled)
        #expect(h.log.entries == before)
        host.event(.cancel)
        await until { root.isAtRest }
        root.choose(.client)
        #expect(root.state.side == .client)
    }

    @Test func teardownPrecedesBuildAndSameChoiceDoesNothing() {
        let h = Harness()
        defer { h.finish() }
        let root = AppRoot(radios: h.pair, launchSide: .host, clock: h.clock, store: h.store, log: h.log)
        let before = h.log.entries
        root.choose(.host)
        #expect(h.log.entries == before)
        root.choose(.client)
        root.choose(.host)
        #expect(Array(h.log.entries.dropFirst(6)) == [
            .init(category: .mode, message: "host tornDown"),
            .init(category: .mode, message: "client built"),
            .init(category: .clientFind, message: "idle"),
            .init(category: .mode, message: "client tornDown"),
            .init(category: .mode, message: "host built"),
        ] + initialHostLogs)
    }

    @Test func radiosKeptAcrossSwitchesAndNeverStartedByShell() {
        let h = Harness()
        defer { h.finish() }
        let root = AppRoot(radios: h.pair, launchSide: .host, clock: h.clock, store: h.store, log: h.log)
        let host = root.radios.host
        let client = root.radios.client
        root.choose(.client)
        root.choose(.host)
        #expect(root.radios.host === host && root.radios.client === client)
        #expect(host is LoggedHostRadio && client is LoggedClientRadio)
        #expect(h.host.calls.isEmpty && h.client.calls.isEmpty)
        #expect(h.log.entries.filter { $0.category != .mode } == [
            .init(category: .hostRadio, message: "built"),
            .init(category: .clientRadio, message: "built"),
        ] + initialHostLogs + initialClientLogs + initialHostLogs)
        let session = UUID()
        host.finish(session)
        client.drop()
        #expect(h.host.calls == [.finish(session)])
        #expect(h.client.calls == [.drop])
    }

    private var initialClientLogs: [LogEntry] { [.init(category: .clientFind, message: "idle")] }

    private var initialHostLogs: [LogEntry] {
        [.init(category: .amountEntry, message: "typing digits=0"), .init(category: .timeoutNotice, message: "hidden"),
         .init(category: .hostBroadcast, message: "ready")]
    }
}
