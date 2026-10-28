import Foundation
import Preferences
import Testing

struct PreferencesTests {
    @Test func valueRoundTrips() {
        withSuite { suiteName in
            let preferences = Preferences(suiteName: suiteName)
            let values: [Preferences.Value] = [
                .number(30), .text("MIZAN-1234"), .number(0), .text("30"),
                .number(-1234.5), .text(""), .number(1e20), .text("ميزان 🧾"),
            ]

            for (index, value) in values.enumerated() {
                preferences.set(value, for: "key-\(index)")
                preferences.set(value, for: "replaced")

                #expect(preferences.value(for: "key-\(index)") == value)
                #expect(preferences.value(for: "replaced") == value)
            }
            for (index, value) in values.enumerated() {
                #expect(preferences.value(for: "key-\(index)") == value)
            }
            #expect(preferences.value(for: "unwritten") == nil)
        }
    }

    @Test func valueSurvivesANewInstance() {
        withSuite { suiteName in
            let values: [(String, Preferences.Value)] = [
                ("countdown", .number(30)), ("name", .text("MIZAN-1234")),
                ("fraction", .number(-1234.5)), ("numeric-text", .text("30")),
                ("zero", .number(0)), ("empty-text", .text("")),
                ("large", .number(1e20)), ("unicode", .text("ميزان 🧾")),
            ]
            do {
                let writer = Preferences(suiteName: suiteName)
                for (key, value) in values {
                    writer.set(value, for: key)
                }
            }
            let reader = Preferences(suiteName: suiteName)

            for (key, value) in values {
                #expect(reader.value(for: key) == value)
            }
            #expect(reader.value(for: "unwritten") == nil)
            withSuite { otherSuiteName in
                let other = Preferences(suiteName: otherSuiteName)
                #expect(other.value(for: "countdown") == nil)
                other.set(.number(90), for: "countdown")
                #expect(reader.value(for: "countdown") == .number(30))
                #expect(other.value(for: "countdown") == .number(90))
            }
        }
    }

    @Test func unwrittenKeyReadsNothing() {
        withSuite { suiteName in
            let preferences = Preferences(suiteName: suiteName)

            #expect(preferences.value(for: "countdown") == nil)
            #expect(preferences.value(for: "another-key") == nil)
        }
    }

    private func withSuite(_ body: (String) -> Void) {
        let suiteName = "PreferencesTests.\(UUID().uuidString)"
        defer { UserDefaults(suiteName: suiteName)!.removePersistentDomain(forName: suiteName) }
        body(suiteName)
    }
}
