public struct SpeechVoiceDescriptor: Equatable, Sendable {
    public let identifier: String
    public let language: String
    public let isAudioCapable: Bool

    public init(identifier: String, language: String, isAudioCapable: Bool) {

        self.identifier = identifier
        self.language = language
        self.isAudioCapable = isAudioCapable
    }
}

public enum SpeechVoiceSelection {
    public static let automaticIdentifier = "automatic"

    public static func automaticVoiceIdentifier(
        matching languageCode: String,
        availableVoices: [SpeechVoiceDescriptor]
    ) -> String? {

        let languageMatches = availableVoices.filter { $0.language == languageCode }
        let audioCapableMatch = languageMatches.first(where: \.isAudioCapable)
        return (audioCapableMatch ?? languageMatches.first)?.identifier
    }

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
