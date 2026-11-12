import Foundation

/// The language the panel shows its text in.
public enum PanelLanguage: String, CaseIterable, Sendable {

    case russian = "ru"
    case english = "en"
}

/// A fixed piece of panel text; its raw value is the key in the strings tables.
///
/// The `diskFullLine`, `gap*` and `lateSpan` phrases are formats that take one time or span, `%@`;
/// `newBelow` and `themNumbered` take a number, `%d`.
public enum PanelPhrase: String, CaseIterable, Sendable {

    case callAudioTitle = "banner.callAudio.title"
    case callAudioLine = "banner.callAudio.line"
    case microphoneTitle = "banner.microphone.title"
    case microphoneLine = "banner.microphone.line"
    case diskFullTitle = "banner.diskFull.title"
    case diskFullLine = "banner.diskFull.line"
    case callSilentTitle = "banner.callSilent.title"
    case callSilentLine = "banner.callSilent.line"
    case openSettings = "banner.openSettings"
    case openFolder = "banner.openFolder"
    case gapCallAudio = "gap.callAudio"
    case gapMicrophone = "gap.microphone"
    case gapDiskFull = "gap.diskFull"
    case gapCallSilent = "gap.callSilent"
    case notRecording = "status.notRecording"
    case start = "action.start"
    case stop = "action.stop"
    case emptyLog = "log.empty"
    case liveTextOff = "log.liveTextOff"
    case switchLiveTextOn = "action.liveTextOn"
    case preparing = "log.preparing"
    case preparingNote = "log.preparingNote"
    case release = "held.release"
    case releaseLabel = "held.releaseLabel"
    case newBelow = "log.newBelow"
    case me = "speaker.me"
    case them = "speaker.them"
    /// An unnamed remote speaker after the call, by its place among the call's speakers.
    case themNumbered = "speaker.themNumbered"
    case lateSpan = "log.lateSpan"
}

/// Looks up the panel's text in a given language, whatever the process locale.
///
/// A key missing from the language's table falls back to Russian, then to the key itself.
public struct PanelText: Equatable, Sendable {

    public let language: PanelLanguage

    public init(language: PanelLanguage) {

        self.language = language
    }

    public func callAsFunction(_ phrase: PanelPhrase) -> String {

        self(phrase.rawValue)
    }

    func callAsFunction(_ key: String) -> String {

        let russian = Self.table(.russian)?.localizedString(forKey: key, value: key, table: nil) ?? key
        guard language != .russian else { return russian }
        return Self.table(language)?.localizedString(forKey: key, value: russian, table: nil) ?? russian
    }

    private static func table(_ language: PanelLanguage) -> Bundle? {

        resources.path(forResource: language.rawValue, ofType: "lproj").flatMap(Bundle.init(path:))
    }

    private static let resources = panelBundle(mainBundleURL: Bundle.main.bundleURL)
}

func panelBundle(mainBundleURL: URL, fallback: () -> Bundle = { Bundle.module }) -> Bundle {

    // App bundles keep resources in Contents/Resources; SwiftPM executables
    // and tests use the generated module lookup beside the executable or in the build.
    Bundle(url: mainBundleURL)?
        .url(forResource: "Audelin_PanelUI", withExtension: "bundle")
        .flatMap(Bundle.init(url:)) ?? fallback()
}
