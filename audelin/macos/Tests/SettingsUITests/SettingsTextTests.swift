@testable import SettingsUI
import Testing

struct SettingsTextTests {

    @Test func everyKeyHasRussianAndEnglishText() {

        let russian = SettingsText(language: .russian), english = SettingsText(language: .english)
        for key in SettingsPhrase.allCases.map(\.rawValue) {
            #expect(russian(key) != key, "\(key) has no Russian text")
            #expect(english(key) != key, "\(key) has no English text")
            #expect(!english(key).contains(where: { ("а"..."я").contains($0) || ("А"..."Я").contains($0) }), "\(key) is not translated")
        }
    }
}
