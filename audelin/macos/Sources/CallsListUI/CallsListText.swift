import Foundation

/// The language the calls list shows its text in.
public enum CallsListLanguage: String, CaseIterable, Sendable {

    case russian = "ru"
    case english = "en"
}

/// A fixed piece of calls list text; its raw value is the key in the strings tables.
public enum CallsListPhrase: String, CaseIterable, Sendable {

    case loading = "list.loading"
    case empty = "list.empty"
    case emptyHint = "list.emptyHint"
    case titlePlaceholder = "row.titlePlaceholder"
    case retrySummary = "row.retrySummary"
    case makeSummary = "row.makeSummary"
    case open = "row.open"
    case delete = "row.delete"
    case deleteMenu = "row.deleteMenu"
    case rename = "row.rename"
    case deleteTitle = "delete.title"
    /// Takes the call's folder name.
    case deleteBody = "delete.body"
    case cancel = "delete.cancel"
    case today = "day.today"
    case yesterday = "day.yesterday"
    /// Date patterns for a day's header.
    case weekdayDate = "day.weekdayDate"
    case dayMonth = "day.dayMonth"
    case dayMonthYear = "day.dayMonthYear"
    /// Each takes the number of calls.
    case callsOne = "day.callsOne"
    case callsFew = "day.callsFew"
    case callsMany = "day.callsMany"
    case summaryWaiting = "summary.waiting"
    case summaryPending = "summary.pending"
    case summaryRunning = "summary.running"
    case summaryReady = "summary.ready"
    case summaryReadyUnnamed = "summary.readyUnnamed"
    case summaryFailed = "summary.failed"
    case summaryInterrupted = "summary.interrupted"
    case rowPreparing = "row.preparing"
    case rowFailed = "row.failed"
    case summaryUnavailable = "summary.unavailable"
    case summaryRetryFailed = "summary.retryFailed"
    case windowTitle = "window.title"
    /// Takes the call id.
    case openFailed = "row.openFailed"
    case searchPlaceholder = "search.placeholder"
    case searchNotes = "search.notes"
    /// Takes the number of further matches.
    case searchMore = "search.more"
    case searching = "search.searching"
    case noMatches = "search.noMatches"
    /// Takes the query.
    case noMatchesHint = "search.noMatchesHint"
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
