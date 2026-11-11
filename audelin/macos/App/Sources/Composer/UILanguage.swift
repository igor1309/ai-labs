import CallsListUI
import Foundation
import MenuBar
import PanelUI
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
