import Foundation

public struct Preferences: Codable, Equatable, Sendable {

    public var automaticRecording: Bool
    public var liveText: Bool
    public var callsFolder: URL

    public init(
        automaticRecording: Bool = true,
        liveText: Bool = true,
        callsFolder: URL = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Recordings/Audelin", isDirectory: true)
    ) {

        self.automaticRecording = automaticRecording
        self.liveText = liveText
        self.callsFolder = callsFolder
    }

    private enum CodingKeys: String, CodingKey {

        case automaticRecording, liveText, callsFolder
    }

    public init(from decoder: any Decoder) throws {

        let values = try decoder.container(keyedBy: CodingKeys.self)
        let defaults = Preferences()
        automaticRecording = try values.decodeIfPresent(Bool.self, forKey: .automaticRecording)
            ?? defaults.automaticRecording
        liveText = try values.decodeIfPresent(Bool.self, forKey: .liveText) ?? defaults.liveText
        callsFolder = try values.decodeIfPresent(URL.self, forKey: .callsFolder) ?? defaults.callsFolder
    }
}
