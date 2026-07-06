import FolioTellCore
import Testing

struct SpeechVoiceSelectionTests {

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
}
