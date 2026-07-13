public enum SpeechVoiceQuality: Int, Comparable, Sendable {
    case standard = 1
    case enhanced = 2
    case premium = 3

    public static func < (lhs: Self, rhs: Self) -> Bool {

        lhs.rawValue < rhs.rawValue
    }
}

public struct SpeechVoiceDescriptor: Equatable, Sendable {
    public let identifier: String
    public let language: String
    public let isAudioCapable: Bool
    public let quality: SpeechVoiceQuality

    public init(
        identifier: String,
        language: String,
        isAudioCapable: Bool,
        quality: SpeechVoiceQuality = .standard
    ) {

        self.identifier = identifier
        self.language = language
        self.isAudioCapable = isAudioCapable
        self.quality = quality
    }
}

public enum SpeechVoiceSelection {
    public static let automaticIdentifier = "automatic"

    public static func automaticVoiceIdentifier(
        matching languageCode: String,
        availableVoices: [SpeechVoiceDescriptor]
    ) -> String? {

        let languageMatches = availableVoices.filter { $0.language == languageCode }
        let audioCapableMatches = languageMatches.filter(\.isAudioCapable)
        // Quality ranks only audio-capable voices: a broken high-quality asset
        // must never beat a working compact one. max(by:) keeps the first of
        // equals, preserving catalog order on ties.
        let bestAudioCapableMatch = audioCapableMatches.max { $0.quality < $1.quality }
        return (bestAudioCapableMatch ?? languageMatches.first)?.identifier
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
