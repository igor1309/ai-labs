import FolioTellCore
import Testing

struct SpeechVoiceLanguageTests {

    @Test func test_languageCode_shouldReturnRussian_onCyrillicText() {

        #expect(SpeechVoiceLanguage.languageCode(for: "Мороз и солнце, день чудесный") == "ru-RU")
    }

    @Test func test_languageCode_shouldReturnEnglish_onNonCyrillicText() {

        #expect(SpeechVoiceLanguage.languageCode(for: "Winter morning") == "en-US")
    }
}
