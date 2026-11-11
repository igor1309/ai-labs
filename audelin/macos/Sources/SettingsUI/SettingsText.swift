import Foundation

/// The language Settings shows its text in.
public enum SettingsLanguage: String, CaseIterable, Sendable {

    case russian = "ru"
    case english = "en"
}

/// A fixed piece of Settings text; its raw value is the key in the strings tables.
public enum SettingsPhrase: String, CaseIterable, Sendable {

    /// Takes the call count and the total size.
    case moveTitle = "move.title"
    /// Takes the call count, the total size and the destination path.
    case moveBody = "move.body"
    /// Takes the moved and total call counts, then the moved and total sizes.
    case moveDetail = "move.detail"
    /// Takes the moved and total call counts.
    case moveMoved = "move.moved"
    case moveCounting = "move.counting"
    case moveRefreshing = "move.refreshing"
    case recordingTab = "tab.recording"
    case callNotesTab = "tab.callNotes"
    case recordingRow = "row.recording"
    case folderRow = "row.folder"
    case engineRow = "row.engine"
    case audioRow = "row.audio"
    case explainRow = "row.explain"
    case chunkRow = "row.chunk"
    case recordsCalls = "recording.automatic"
    case recordsCallsNote = "recording.automaticNote"
    case liveText = "recording.liveText"
    case liveTextNote = "recording.liveTextNote"
    case changeFolder = "folder.change"
    case folderIdle = "folder.idle"
    case folderPartlyHere = "folder.partlyHere"
    case retry = "folder.retry"
    case cancel = "folder.cancel"
    case folderRecording = "folder.recording"
    case pickerFailed = "folder.pickerFailed"
    case audioNote = "audio.note"
    case explainNote = "explain.note"
    case chunkSeconds = "chunk.seconds"
    case chunkNote = "chunk.note"
    case confirmMove = "move.confirm"
    case localRecognition = "engine.localNote"
}

/// Looks up Settings text in a given language, whatever the process locale.
///
/// A key missing from the language's table falls back to Russian, then to the key itself.
/// Formats fill in their arguments with the language's plural rules.
public struct SettingsText: Equatable, Sendable {

    public let language: SettingsLanguage

    public init(language: SettingsLanguage) {

        self.language = language
    }

    public var locale: Locale { Locale(identifier: language.rawValue) }

    public func callAsFunction(_ phrase: SettingsPhrase, _ arguments: any CVarArg...) -> String {

        let format = self(phrase.rawValue)
        return arguments.isEmpty ? format : String(format: format, locale: locale, arguments: arguments)
    }

    /// A byte count as a file size in the language.
    public func size(_ bytes: Int64) -> String {

        bytes.formatted(.byteCount(style: .file).locale(locale))
    }

    func callAsFunction(_ key: String) -> String {

        let russian = Self.table(.russian)?.localizedString(forKey: key, value: key, table: nil) ?? key
        guard language != .russian else { return russian }
        return Self.table(language)?.localizedString(forKey: key, value: russian, table: nil) ?? russian
    }

    private static func table(_ language: SettingsLanguage) -> Bundle? {

        resources.path(forResource: language.rawValue, ofType: "lproj").flatMap(Bundle.init(path:))
    }

    private static let resources = settingsBundle(mainBundleURL: Bundle.main.bundleURL)
}

func settingsBundle(mainBundleURL: URL, fallback: () -> Bundle = { Bundle.module }) -> Bundle {

    // App bundles keep resources in Contents/Resources; SwiftPM executables
    // and tests use the generated module lookup beside the executable or in the build.
    Bundle(url: mainBundleURL)?
        .url(forResource: "Audelin_SettingsUI", withExtension: "bundle")
        .flatMap(Bundle.init(url:)) ?? fallback()
}
