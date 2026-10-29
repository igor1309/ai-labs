import Foundation
import Testing
import Preferences
@testable import Root

@Suite struct AppPreferencesTests {
    /// `UserDefaults(suiteName:)` gives nil for the running app's own bundle
    /// identifier, so the suite must differ from every app target's.
    @Test func theAppSuiteIsNoAppsBundleIdentifier() throws {
        let project = URL(filePath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appending(path: "project.yml")
        let identifiers = try String(contentsOf: project, encoding: .utf8)
            .split(separator: "\n")
            .compactMap { line -> String? in
                let parts = line.split(separator: ":", maxSplits: 1)
                guard parts.count == 2, parts[0].trimmingCharacters(in: .whitespaces) == "PRODUCT_BUNDLE_IDENTIFIER" else { return nil }
                return parts[1].trimmingCharacters(in: .whitespaces)
            }
        #expect(identifiers.count == 2)
        #expect(Preferences.appSuiteName == "mizan-ble")
        #expect(!identifiers.contains(Preferences.appSuiteName))
    }
}
