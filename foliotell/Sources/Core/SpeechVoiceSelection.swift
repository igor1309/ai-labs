public enum SpeechVoiceSelection {
    public static let automaticIdentifier = "automatic"

    public static func filteredVoiceIdentifiers(
        availableIdentifiers: Set<String>,
        languagesByIdentifier: [String: String],
        detectedLanguageCode: String?
    ) -> Set<String> {

        guard let detectedLanguageCode else {
            return availableIdentifiers
        }

        let filteredIdentifiers = availableIdentifiers.filter { identifier in
            languagesByIdentifier[identifier] == detectedLanguageCode
        }
        return filteredIdentifiers.isEmpty ? availableIdentifiers : filteredIdentifiers
    }

    public static func selectedVoiceIdentifier(
        storedIdentifier: String,
        availableIdentifiers: Set<String>
    ) -> String? {

        guard storedIdentifier != automaticIdentifier else {
            return nil
        }

        return availableIdentifiers.contains(storedIdentifier) ? storedIdentifier : nil
    }
}
