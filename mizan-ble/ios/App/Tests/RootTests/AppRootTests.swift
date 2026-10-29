import Testing
import Foundation
@testable import Root

@Suite @MainActor struct AppRootTests {
    @Test(arguments: Side.allCases) func launchUsesDeviceRole(_ side: Side) {
        let h = Harness()
        defer { h.finish() }
        let root = AppRoot(radios: h.pair, launchSide: side, log: h.log)
        #expect(root.state.side == side)
        #expect(root.modeSwitchState.side == side)
        #expect(root.isAtRest && root.modeSwitchState.isEnabled)
        #expect(h.host.calls.isEmpty && h.client.calls.isEmpty)
        #expect(h.log.entries == [
            .init(category: .hostRadio, message: "built"),
            .init(category: .clientRadio, message: "built"),
            .init(category: .mode, message: "\(side == .host ? "host" : "client") built"),
        ])
    }

    @Test(arguments: Side.allCases) func switchAtRest(_ side: Side) {
        let h = Harness()
        defer { h.finish() }
        let root = AppRoot(radios: h.pair, launchSide: side, log: h.log)
        let other: Side = side == .host ? .client : .host
        root.choose(other)
        #expect(root.state.side == other)
        #expect(root.isAtRest && root.modeSwitchState.isEnabled)
        #expect(h.log.entries.last == .init(category: .mode, message: "\(other == .host ? "host" : "client") built"))
    }

    @Test(arguments: Side.allCases) func switchIgnoredWhileBusy(_ side: Side) {
        let h = Harness()
        defer { h.finish() }
        let root = AppRoot(radios: h.pair, launchSide: side, log: h.log)
        root.isAtRest = false
        #expect(h.log.entries.last == .init(category: .mode, message: "\(side == .host ? "host" : "client") busy"))
        let before = h.log.entries
        root.choose(side == .host ? .client : .host)
        #expect(root.state.side == side)
        #expect(!root.modeSwitchState.isEnabled)
        #expect(h.log.entries == before)
        root.isAtRest = true
        #expect(h.log.entries.last == .init(category: .mode, message: "\(side == .host ? "host" : "client") atRest"))
        root.choose(side == .host ? .client : .host)
        #expect(root.state.side != side)
    }

    @Test func teardownPrecedesBuildAndSameChoiceDoesNothing() {
        let h = Harness()
        defer { h.finish() }
        let root = AppRoot(radios: h.pair, launchSide: .host, log: h.log)
        let before = h.log.entries
        root.choose(.host)
        #expect(h.log.entries == before)
        root.choose(.client)
        root.choose(.host)
        #expect(Array(h.log.entries.dropFirst(3)) == [
            .init(category: .mode, message: "host tornDown"),
            .init(category: .mode, message: "client built"),
            .init(category: .mode, message: "client tornDown"),
            .init(category: .mode, message: "host built"),
        ])
    }

    @Test func radiosKeptAcrossSwitchesAndNeverStartedByShell() {
        let h = Harness()
        defer { h.finish() }
        let root = AppRoot(radios: h.pair, launchSide: .host, log: h.log)
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
        ])
        let session = UUID()
        host.finish(session)
        client.drop()
        #expect(h.host.calls == [.finish(session)])
        #expect(h.client.calls == [.drop])
    }
}
