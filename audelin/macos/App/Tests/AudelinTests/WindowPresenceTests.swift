import AppKit
import Testing
@testable import Audelin

@MainActor
struct WindowPresenceTests {
    @Test func appearsInTheDockWhileAnyWindowIsOpenAndLeavesWithTheLast() {
        var policies: [NSApplication.ActivationPolicy] = []
        let presence = WindowPresence(setPolicy: { policies.append($0) })
        let settings = NSObject(), calls = NSObject()
        presence.shown(settings)
        presence.shown(calls)
        presence.shown(settings)
        #expect(policies == [.regular])
        presence.closed(settings)
        #expect(policies == [.regular])
        presence.closed(calls)
        #expect(policies == [.regular, .accessory])
        presence.closed(calls)
        #expect(policies == [.regular, .accessory])
    }
}
