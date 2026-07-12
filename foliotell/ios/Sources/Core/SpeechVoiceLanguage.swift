public enum SpeechVoiceLanguage {

    public static func languageCode(for text: String) -> String? {

        text.unicodeScalars.contains(where: \.isCyrillic) ? "ru-RU" : "en-US"
    }
}

private extension Unicode.Scalar {

    var isCyrillic: Bool {
        (0x0400...0x052F).contains(Int(value))
    }
}
