import Foundation

/// The language the person chose for Audelin's text.
public enum LanguageChoice: String, CaseIterable, Sendable {
    /// Follow macOS: its first preferred language Audelin has, else English.
    case system
    case russian
    case english
}

/// A language Audelin's text is written in.
public enum UILanguage: String, CaseIterable, Sendable {
    case russian = "ru"
    case english = "en"
}

/// The language Audelin shows, from the choice and macOS's preferred languages, most preferred first.
public func uiLanguage(_ choice: LanguageChoice, preferred: [String]) -> UILanguage {
    switch choice {
    case .russian: return .russian
    case .english: return .english
    case .system:
        for identifier in preferred {
            let code = Locale.Language(identifier: identifier).languageCode?.identifier
            if let language = UILanguage(rawValue: code ?? "") { return language }
        }
        return .english
    }
}
