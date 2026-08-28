import FolioTellCore
import Testing

struct SpeechVoiceSelectionTests {

    @Test func test_voiceSelection_shouldResolveEnglishAutoVoice_onEnglishDocumentAfterRussianSelection() {

        let availableVoices = [
            SpeechVoiceDescriptor(identifier: "voice-ru", language: "ru-RU", isAudioCapable: true),
            SpeechVoiceDescriptor(identifier: "voice-en", language: "en-US", isAudioCapable: true),
        ]
        let languageCode = SpeechVoiceLanguage.languageCode(for: "Winter morning")
        let availableIdentifiers = Set(availableVoices.map(\.identifier))
        let languagesByIdentifier = Dictionary(uniqueKeysWithValues: availableVoices.map { ($0.identifier, $0.language) })
        let documentVoiceIdentifiers = SpeechVoiceSelection.filteredVoiceIdentifiers(
            availableIdentifiers: availableIdentifiers,
            languagesByIdentifier: languagesByIdentifier,
            detectedLanguageCode: languageCode
        )
        let selectedVoiceIdentifier = SpeechVoiceSelection.selectedVoiceIdentifier(
            storedIdentifier: "voice-ru",
            availableIdentifiers: documentVoiceIdentifiers
        ) ?? languageCode.flatMap {
            SpeechVoiceSelection.automaticVoiceIdentifier(matching: $0, availableVoices: availableVoices)
        }

        #expect(selectedVoiceIdentifier == "voice-en")
    }

    @Test func test_filteredVoiceIdentifiers_shouldReturnMatchingLanguageVoices_onDetectedLanguage() {

        #expect(
            SpeechVoiceSelection.filteredVoiceIdentifiers(
                availableIdentifiers: ["voice-ru", "voice-en"],
                languagesByIdentifier: [
                    "voice-ru": "ru-RU",
                    "voice-en": "en-US",
                ],
                detectedLanguageCode: "ru-RU"
            ) == ["voice-ru"]
        )
    }

    @Test func test_filteredVoiceIdentifiers_shouldReturnAllVoices_onMissingDetectedLanguage() {

        #expect(
            SpeechVoiceSelection.filteredVoiceIdentifiers(
                availableIdentifiers: ["voice-ru", "voice-en"],
                languagesByIdentifier: [
                    "voice-ru": "ru-RU",
                    "voice-en": "en-US",
                ],
                detectedLanguageCode: nil
            ) == ["voice-ru", "voice-en"]
        )
    }

    @Test func test_filteredVoiceIdentifiers_shouldReturnAllVoices_onNoLanguageMatch() {

        #expect(
            SpeechVoiceSelection.filteredVoiceIdentifiers(
                availableIdentifiers: ["voice-en"],
                languagesByIdentifier: [
                    "voice-en": "en-US",
                ],
                detectedLanguageCode: "ru-RU"
            ) == ["voice-en"]
        )
    }

    @Test func test_selectedVoiceIdentifier_shouldReturnDefault_onAutomaticSelection() {

        #expect(
            SpeechVoiceSelection.selectedVoiceIdentifier(
                storedIdentifier: SpeechVoiceSelection.automaticIdentifier,
                availableIdentifiers: ["voice-a"]
            ) == nil
        )
    }

    @Test func test_selectedVoiceIdentifier_shouldReturnStoredIdentifier_onAvailableVoice() {

        #expect(
            SpeechVoiceSelection.selectedVoiceIdentifier(
                storedIdentifier: "voice-a",
                availableIdentifiers: ["voice-a"]
            ) == "voice-a"
        )
    }

    @Test func test_selectedVoiceIdentifier_shouldReturnDefault_onUnavailableVoice() {

        #expect(
            SpeechVoiceSelection.selectedVoiceIdentifier(
                storedIdentifier: "voice-a",
                availableIdentifiers: ["voice-b"]
            ) == nil
        )
    }

    @Test func test_automaticVoiceIdentifier_shouldReturnMatchingVoice_onExactLanguageMatch() {

        #expect(
            SpeechVoiceSelection.automaticVoiceIdentifier(
                matching: "ru-RU",
                availableVoices: [
                    SpeechVoiceDescriptor(identifier: "voice-ru", language: "ru-RU", isAudioCapable: true),
                    SpeechVoiceDescriptor(identifier: "voice-en", language: "en-US", isAudioCapable: true),
                ]
            ) == "voice-ru"
        )
    }

    @Test func test_automaticVoiceIdentifier_shouldPreferAudioCapableVoice_onBrokenVoiceListedFirst() {

        #expect(
            SpeechVoiceSelection.automaticVoiceIdentifier(
                matching: "ru-RU",
                availableVoices: [
                    SpeechVoiceDescriptor(identifier: "voice-ru-broken", language: "ru-RU", isAudioCapable: false),
                    SpeechVoiceDescriptor(identifier: "voice-ru-capable", language: "ru-RU", isAudioCapable: true),
                ]
            ) == "voice-ru-capable"
        )
    }

    @Test func test_automaticVoiceIdentifier_shouldReturnMatchingVoice_onNoAudioCapableMatch() {

        #expect(
            SpeechVoiceSelection.automaticVoiceIdentifier(
                matching: "ru-RU",
                availableVoices: [
                    SpeechVoiceDescriptor(identifier: "voice-ru-broken", language: "ru-RU", isAudioCapable: false),
                ]
            ) == "voice-ru-broken"
        )
    }

    @Test func test_automaticVoiceIdentifier_shouldPreferHigherQualityVoice_onLowerQualityListedFirst() {

        #expect(
            SpeechVoiceSelection.automaticVoiceIdentifier(
                matching: "ru-RU",
                availableVoices: [
                    SpeechVoiceDescriptor(identifier: "voice-ru-compact", language: "ru-RU", isAudioCapable: true, quality: .standard),
                    SpeechVoiceDescriptor(identifier: "voice-ru-enhanced", language: "ru-RU", isAudioCapable: true, quality: .enhanced),
                ]
            ) == "voice-ru-enhanced"
        )
    }

    @Test func test_automaticVoiceIdentifier_shouldPreferPremiumVoice_onEnhancedListedFirst() {

        #expect(
            SpeechVoiceSelection.automaticVoiceIdentifier(
                matching: "ru-RU",
                availableVoices: [
                    SpeechVoiceDescriptor(identifier: "voice-ru-enhanced", language: "ru-RU", isAudioCapable: true, quality: .enhanced),
                    SpeechVoiceDescriptor(identifier: "voice-ru-premium", language: "ru-RU", isAudioCapable: true, quality: .premium),
                ]
            ) == "voice-ru-premium"
        )
    }

    @Test func test_automaticVoiceIdentifier_shouldPreferAudioCapableVoice_onHigherQualityBrokenVoice() {

        #expect(
            SpeechVoiceSelection.automaticVoiceIdentifier(
                matching: "ru-RU",
                availableVoices: [
                    SpeechVoiceDescriptor(identifier: "voice-ru-enhanced-broken", language: "ru-RU", isAudioCapable: false, quality: .enhanced),
                    SpeechVoiceDescriptor(identifier: "voice-ru-compact", language: "ru-RU", isAudioCapable: true, quality: .standard),
                ]
            ) == "voice-ru-compact"
        )
    }

    @Test func test_automaticVoiceIdentifier_shouldReturnFirstVoice_onEqualQualityMatches() {

        #expect(
            SpeechVoiceSelection.automaticVoiceIdentifier(
                matching: "ru-RU",
                availableVoices: [
                    SpeechVoiceDescriptor(identifier: "voice-ru-first", language: "ru-RU", isAudioCapable: true, quality: .enhanced),
                    SpeechVoiceDescriptor(identifier: "voice-ru-second", language: "ru-RU", isAudioCapable: true, quality: .enhanced),
                ]
            ) == "voice-ru-first"
        )
    }

    @Test func test_automaticVoiceIdentifier_shouldReturnDefault_onNoLanguageMatch() {

        #expect(
            SpeechVoiceSelection.automaticVoiceIdentifier(
                matching: "ru-RU",
                availableVoices: [
                    SpeechVoiceDescriptor(identifier: "voice-en", language: "en-US", isAudioCapable: true),
                ]
            ) == nil
        )
    }
}
