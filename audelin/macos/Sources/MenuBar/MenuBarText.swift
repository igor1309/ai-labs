import Foundation

/// The language the menu bar shows its text in.
public enum MenuBarLanguage: String, CaseIterable, Sendable {

    case russian = "ru"
    case english = "en"
}

/// Looks up the menu bar's text in a given language, whatever the process locale.
///
/// A key missing from the language's table falls back to Russian, then to the key itself.
public struct MenuBarText: Sendable {

    public let language: MenuBarLanguage

    public init(language: MenuBarLanguage) {

        self.language = language
    }

    public func callAsFunction(_ key: String) -> String {

        let russian = Self.table(.russian)?.localizedString(forKey: key, value: key, table: nil) ?? key
        guard language != .russian else { return russian }
        return Self.table(language)?.localizedString(forKey: key, value: russian, table: nil) ?? russian
    }

    private static func table(_ language: MenuBarLanguage) -> Bundle? {

        resources.path(forResource: language.rawValue, ofType: "lproj").flatMap(Bundle.init(path:))
    }

    private static let resources = menuBarBundle(mainBundleURL: Bundle.main.bundleURL)
}

func menuBarBundle(mainBundleURL: URL, fallback: () -> Bundle = { Bundle.module }) -> Bundle {

    // App bundles keep resources in Contents/Resources; SwiftPM executables
    // and tests use the generated module lookup beside the executable or in the build.
    Bundle(url: mainBundleURL)?
        .url(forResource: "Audelin_MenuBar", withExtension: "bundle")
        .flatMap(Bundle.init(url:)) ?? fallback()
}
