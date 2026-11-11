import Foundation

/// The language the calls list shows its text in.
public enum CallsListLanguage: String, CaseIterable, Sendable {

    case russian = "ru"
    case english = "en"
}

/// A fixed piece of calls list text; its raw value is the key in the strings tables.
public enum CallsListPhrase: String, CaseIterable, Sendable {

    case dateColumn = "column.date"
    case callColumn = "column.call"
    case durationColumn = "column.duration"
    case loading = "list.loading"
    case empty = "list.empty"
    case footer = "list.footer"
    case titlePlaceholder = "row.titlePlaceholder"
    case retrySummary = "row.retrySummary"
    case open = "row.open"
    case delete = "row.delete"
    case showNotes = "row.showNotes"
    case deleteTitle = "delete.title"
    /// Takes the call's folder name.
    case deleteBody = "delete.body"
    case cancel = "delete.cancel"
    /// Takes the minutes.
    case minutes = "duration.minutes"
    /// Takes the hours, then the minutes.
    case hoursMinutes = "duration.hoursMinutes"
    case summaryWaiting = "summary.waiting"
    case summaryPending = "summary.pending"
    case summaryRunning = "summary.running"
    case summaryReady = "summary.ready"
    case summaryReadyUnnamed = "summary.readyUnnamed"
    case summaryFailed = "summary.failed"
    case summaryInterrupted = "summary.interrupted"
    case summaryUnavailable = "summary.unavailable"
    case summaryRetryFailed = "summary.retryFailed"
    case windowTitle = "window.title"
    /// Takes the call id.
    case openFailed = "row.openFailed"
}

/// Looks up calls list text in a given language, whatever the process locale.
///
/// A key missing from the language's table falls back to Russian, then to the key itself.
/// Formats fill in their arguments with the language's plural rules.
public struct CallsListText: Equatable, Sendable {

    public let language: CallsListLanguage

    public init(language: CallsListLanguage) {

        self.language = language
    }

    public var locale: Locale { Locale(identifier: language.rawValue) }

    public func callAsFunction(_ phrase: CallsListPhrase, _ arguments: any CVarArg...) -> String {

        let format = self(phrase.rawValue)
        return arguments.isEmpty ? format : String(format: format, locale: locale, arguments: arguments)
    }

    func callAsFunction(_ key: String) -> String {

        let russian = Self.table(.russian)?.localizedString(forKey: key, value: key, table: nil) ?? key
        guard language != .russian else { return russian }
        return Self.table(language)?.localizedString(forKey: key, value: russian, table: nil) ?? russian
    }

    private static func table(_ language: CallsListLanguage) -> Bundle? {

        resources.path(forResource: language.rawValue, ofType: "lproj").flatMap(Bundle.init(path:))
    }

    private static let resources = callsListBundle(mainBundleURL: Bundle.main.bundleURL)
}

func callsListBundle(mainBundleURL: URL, fallback: () -> Bundle = { Bundle.module }) -> Bundle {

    // App bundles keep resources in Contents/Resources; SwiftPM executables
    // and tests use the generated module lookup beside the executable or in the build.
    Bundle(url: mainBundleURL)?
        .url(forResource: "Audelin_CallsListUI", withExtension: "bundle")
        .flatMap(Bundle.init(url:)) ?? fallback()
}
