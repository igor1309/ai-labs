public enum SpeechVoiceSelection {
    public static let automaticIdentifier = "automatic"

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
