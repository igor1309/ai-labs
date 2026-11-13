import CallsRehearsalSupport
import Foundation
import Testing

struct WindowLayoutTests {
    @Test func eachRunStartsWithoutTheLastRunsFramesOrDivider() throws {
        let domain = "CallsRehearsalTests.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: domain))
        defaults.set("0 0 560 360 0 0 1512 949", forKey: "NSWindow Frame CallsWindow")
        defaults.set(240.0, forKey: "CallsSplit.listWidth")
        startWithDefaultLayout(defaults, domain: domain)
        #expect(defaults.object(forKey: "NSWindow Frame CallsWindow") == nil)
        #expect(defaults.object(forKey: "CallsSplit.listWidth") == nil)
    }
}
