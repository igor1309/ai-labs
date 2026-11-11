import CallsListUI
import Foundation
import MenuBar
import PanelUI
import Preferences
import SettingsUI
import SummaryPreviewUI
import Synchronization

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

extension UILanguage {
    var menuBar: MenuBarLanguage { self == .russian ? .russian : .english }
    var panel: PanelLanguage { self == .russian ? .russian : .english }
    var settings: SettingsText { SettingsText(language: self == .russian ? .russian : .english) }
    var callsList: CallsListText { CallsListText(language: self == .russian ? .russian : .english) }
    var preview: SummaryPreviewText { SummaryPreviewText(language: self == .russian ? .russian : .english) }
}

/// The language Audelin's text is shown in now. Text a machine writes while it
/// runs is looked up here, so text written after a change is in the new language.
final class CurrentLanguage: Sendable {
    private let value: Mutex<UILanguage>
    init(_ language: UILanguage) { value = Mutex(language) }
    var language: UILanguage {
        get { value.withLock { $0 } }
        set { value.withLock { $0 = newValue } }
    }
}

extension LanguageChoice {
    init(_ saved: Preferences.Language) {
        switch saved {
        case .system: self = .system
        case .russian: self = .russian
        case .english: self = .english
        }
    }
    var saved: Preferences.Language {
        switch self {
        case .system: .system
        case .russian: .russian
        case .english: .english
        }
    }
}

/// A language's name in that language, as macOS writes it: "Deutsch" for German.
func languageName(_ identifier: String) -> String {
    let code = Locale.Language(identifier: identifier).languageCode?.identifier ?? identifier
    let own = Locale(identifier: code)
    return (own.localizedString(forLanguageCode: code) ?? code).capitalized(with: own)
}

extension SettingsText {
    /// The General tab for the chosen language, its line saying what System gives or what macOS uses.
    func general(_ choice: LanguageChoice, appearance: Preferences.Appearance, preferred: [String]) -> SettingsState.General {
        let macOS = languageName(preferred.first ?? "en")
        let supported = preferred.contains { UILanguage(rawValue: Locale.Language(identifier: $0).languageCode?.identifier ?? "") != nil }
        let hint = switch choice {
        case .system: supported ? self(.languageHintSystem) : self(.languageHintFallback, macOS)
        case .russian, .english: self(.languageHintForced, macOS)
        }
        let selected: SettingsState.General.Language = switch choice {
        case .system: .system
        case .russian: .russian
        case .english: .english
        }
        return .init(
            language: .init(segments: [.init(id: .system, title: self(.languageSystem)),
                                       .init(id: .russian, title: languageName("ru")), .init(id: .english, title: languageName("en"))],
                            selected: selected, hint: hint),
            appearance: .init(segments: [.init(id: .system, title: self(.appearanceSystem)),
                                         .init(id: .light, title: self(.appearanceLight)),
                                         .init(id: .dark, title: self(.appearanceDark))],
                              selected: SettingsState.General.Appearance(rawValue: appearance.rawValue) ?? .system,
                              hint: self(appearance == .light ? .appearanceHintLight : appearance == .dark ? .appearanceHintDark : .appearanceHint)))
    }
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
