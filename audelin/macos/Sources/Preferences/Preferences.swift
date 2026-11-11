import Foundation

public struct Preferences: Codable, Equatable, Sendable {

    /// The language Audelin's text is shown in.
    public enum Language: String, Codable, CaseIterable, Sendable {
        /// Follow macOS's preferred languages.
        case system
        case russian
        case english
    }

    /// Light or dark for Audelin's windows, the panel and the menu bar UI.
    public enum Appearance: String, Codable, CaseIterable, Sendable {
        /// Follow the macOS appearance.
        case system
        case light
        case dark
    }

    public var notes: NotesPreferences
    public var automaticRecording: Bool
    public var liveText: Bool
    public var callsFolder: URL
    public var language: Language
    public var appearance: Appearance

    public init(
        notes: NotesPreferences = .init(),
        automaticRecording: Bool = true,
        liveText: Bool = true,
        callsFolder: URL = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Recordings/Audelin", isDirectory: true),
        language: Language = .system,
        appearance: Appearance = .system
    ) {

        self.notes = notes
        self.automaticRecording = automaticRecording
        self.liveText = liveText
        self.callsFolder = callsFolder
        self.language = language
        self.appearance = appearance
    }

    private enum CodingKeys: String, CodingKey {

        case automaticRecording, liveText, callsFolder, notes, language, appearance
    }

    public init(from decoder: any Decoder) throws {

        let values = try decoder.container(keyedBy: CodingKeys.self)
        let defaults = Preferences()
        notes = try values.decodeIfPresent(NotesPreferences.self, forKey: .notes) ?? defaults.notes
        automaticRecording = try values.decodeIfPresent(Bool.self, forKey: .automaticRecording)
            ?? defaults.automaticRecording
        liveText = try values.decodeIfPresent(Bool.self, forKey: .liveText) ?? defaults.liveText
        callsFolder = try values.decodeIfPresent(URL.self, forKey: .callsFolder) ?? defaults.callsFolder
        // A value a later version wrote reads as the default rather than losing the other preferences.
        language = (try? values.decodeIfPresent(String.self, forKey: .language)).flatMap { $0 }.flatMap(Language.init(rawValue:))
            ?? defaults.language
        appearance = (try? values.decodeIfPresent(String.self, forKey: .appearance)).flatMap { $0 }.flatMap(Appearance.init(rawValue:))
            ?? defaults.appearance
    }
}
