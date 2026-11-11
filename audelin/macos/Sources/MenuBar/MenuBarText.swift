import Foundation

/// The language the menu bar shows its text in.
public enum MenuBarLanguage: String, CaseIterable, Sendable {

    case russian = "ru"
    case english = "en"
}

/// A fixed piece of menu bar text; its raw value is the key in the strings tables.
public enum MenuBarPhrase: String, CaseIterable, Sendable {

    case itemTitle = "item.title"
    case recording = "state.recording"
    case recordingCall = "state.recordingCall"
    case recordingNoText = "state.recordingNoText"
    case ending = "state.ending"
    case waiting = "state.waiting"
    case notRecording = "state.notRecording"
    case blockedMicrophone = "blocked.microphone"
    case blockedCallAudio = "blocked.callAudio"
    case blockedFolder = "blocked.folder"
    case blockedSpace = "blocked.space"
    case faultMicrophone = "fault.microphone"
    case faultCallAudio = "fault.callAudio"
    case faultDiskFull = "fault.diskFull"
    case faultCallSilent = "fault.callSilent"
    case start = "action.start"
    case stop = "action.stop"
    case showPanel = "action.showPanel"
    case hidePanel = "action.hidePanel"
    case automatic = "action.automatic"
    case liveText = "action.liveText"
    case calls = "action.calls"
    case openCallsFolder = "action.openCallsFolder"
    case settings = "action.settings"
    case quit = "action.quit"
    /// Takes the system's reason.
    case watchFailedToStart = "status.watchFailedToStart"
    /// Takes the system's reason.
    case watchStopped = "status.watchStopped"
}

/// Looks up the menu bar's text in a given language, whatever the process locale.
///
/// A key missing from the language's table falls back to Russian, then to the key itself.
public struct MenuBarText: Sendable {

    public let language: MenuBarLanguage

    public init(language: MenuBarLanguage) {

        self.language = language
    }

    public func callAsFunction(_ phrase: MenuBarPhrase) -> String {

        self(phrase.rawValue)
    }

    func callAsFunction(_ key: String) -> String {

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
