import Foundation

public struct Preferences: Codable, Equatable, Sendable {

    /// The language Audelin's text is shown in.
    public enum Language: String, Codable, CaseIterable, Sendable {
        /// Follow macOS's preferred languages.
        case system
        case russian
        case english
    }

    public var notes: NotesPreferences
    public var automaticRecording: Bool
    public var liveText: Bool
    public var callsFolder: URL
    public var language: Language

    public init(
        notes: NotesPreferences = .init(),
        automaticRecording: Bool = true,
        liveText: Bool = true,
        callsFolder: URL = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Recordings/Audelin", isDirectory: true),
        language: Language = .system
    ) {

        self.notes = notes
        self.automaticRecording = automaticRecording
        self.liveText = liveText
        self.callsFolder = callsFolder
        self.language = language
    }

    private enum CodingKeys: String, CodingKey {

        case automaticRecording, liveText, callsFolder, notes, language
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
    }
}
