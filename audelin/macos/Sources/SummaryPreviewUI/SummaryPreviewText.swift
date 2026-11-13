import Foundation

/// The language the summary preview shows its text in.
public enum SummaryPreviewLanguage: String, CaseIterable, Sendable {

    case russian = "ru"
    case english = "en"
}

/// A fixed piece of summary preview text; its raw value is the key in the strings tables.
public enum SummaryPreviewPhrase: String, CaseIterable, Sendable {

    case notes = "preview.notesLabel"
    case copy = "preview.copy"
    case open = "preview.open"
    case rename = "preview.rename"
    case retrySummary = "preview.retrySummary"
    case delete = "preview.delete"
    case making = "preview.making"
    case cancel = "preview.cancel"
    case failed = "preview.failed"
    case noSummary = "preview.noSummary"
    case make = "preview.make"
    /// Takes when the summary was made.
    case made = "preview.made"
    case noSelection = "preview.noSelection"
    /// Takes the system's reason.
    case unreadable = "preview.unreadable"
}

/// Looks up summary preview text in a given language, whatever the process locale.
///
/// A key missing from the language's table falls back to Russian, then to the key itself.
/// Formats fill in their arguments with the language's plural rules.
public struct SummaryPreviewText: Equatable, Sendable {

    public let language: SummaryPreviewLanguage

    public init(language: SummaryPreviewLanguage) {

        self.language = language
    }

    public var locale: Locale { Locale(identifier: language.rawValue) }

    public func callAsFunction(_ phrase: SummaryPreviewPhrase, _ arguments: any CVarArg...) -> String {

        let format = self(phrase.rawValue)
        return arguments.isEmpty ? format : String(format: format, locale: locale, arguments: arguments)
    }

    func callAsFunction(_ key: String) -> String {

        let russian = Self.table(.russian)?.localizedString(forKey: key, value: key, table: nil) ?? key
        guard language != .russian else { return russian }
        return Self.table(language)?.localizedString(forKey: key, value: russian, table: nil) ?? russian
    }

    private static func table(_ language: SummaryPreviewLanguage) -> Bundle? {

        resources.path(forResource: language.rawValue, ofType: "lproj").flatMap(Bundle.init(path:))
    }

    private static let resources = summaryPreviewBundle(mainBundleURL: Bundle.main.bundleURL)
}

func summaryPreviewBundle(mainBundleURL: URL, fallback: () -> Bundle = { Bundle.module }) -> Bundle {

    // App bundles keep resources in Contents/Resources; SwiftPM executables
    // and tests use the generated module lookup beside the executable or in the build.
    Bundle(url: mainBundleURL)?
        .url(forResource: "Audelin_SummaryPreviewUI", withExtension: "bundle")
        .flatMap(Bundle.init(url:)) ?? fallback()
}
