import Foundation
import Preferences
import Testing

struct NotesPreferencesTests {
    @Test func newPreferencesHaveNoFallback() {
        #expect(NotesPreferences().fallback == nil)
    }

    @Test func configuredAndAbsentFallbacksRoundTrip() throws {
        let primary = NotesPreferences().primary
        for fallback in [nil, primary] {
            let notes = NotesPreferences(enabled: true, primary: primary, fallback: fallback)
            let data = try JSONEncoder().encode(notes)
            #expect(try JSONDecoder().decode(NotesPreferences.self, from: data) == notes)
        }
    }

    @Test func missingAndNullFallbackDecodeAsAbsent() throws {
        let primary = try JSONEncoder().encode(NotesPreferences().primary)
        let value = try JSONSerialization.jsonObject(with: primary)
        for fallback in [[:], ["fallback": NSNull()]] as [[String: Any]] {
            let fields = ["enabled": true, "speakers": false, "primary": value].merging(fallback) { _, new in new }
            let data = try JSONSerialization.data(withJSONObject: fields)
            #expect(try JSONDecoder().decode(NotesPreferences.self, from: data).fallback == nil)
        }
    }
}
