import Composer
import Testing

struct UILanguageTests {

    @Test func aChosenLanguageIgnoresMacOS() {
        #expect(uiLanguage(.russian, preferred: ["en-US"]) == .russian)
        #expect(uiLanguage(.english, preferred: ["ru-RU"]) == .english)
        #expect(uiLanguage(.russian, preferred: []) == .russian)
    }

    @Test(arguments: [
        (["ru-RU", "en-US"], UILanguage.russian),
        (["en-GB", "ru-RU"], .english),
        (["ru"], .russian),
        (["uk-UA", "ru-UA", "en-US"], .russian),
        (["de-DE", "en-US", "ru-RU"], .english),
        (["zh-Hans-CN", "fr-FR"], .english),
        ([], .english),
    ])
    func systemTakesTheFirstPreferredLanguageAudelinHas(preferred: [String], expected: UILanguage) {
        #expect(uiLanguage(.system, preferred: preferred) == expected)
    }
}
