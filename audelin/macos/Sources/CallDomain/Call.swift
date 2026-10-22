import Foundation

/// A call's identity: the id in its `meta.json`, never its folder's path.
public struct CallID: Hashable, Sendable, Codable, CustomStringConvertible {
    public let uuid: UUID

    public init(_ uuid: UUID = UUID()) { self.uuid = uuid }

    public var description: String { uuid.uuidString }

    public init(from decoder: any Decoder) throws {
        uuid = try decoder.singleValueContainer().decode(UUID.self)
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(uuid)
    }
}

/// What a call folder's `meta.json` holds. The title is not here: it is the
/// folder's name, which the user may change in Finder.
public struct CallDetails: Codable, Equatable, Sendable {
    public var id: CallID
    public var start: Date
    /// Seconds, once the recording has stopped.
    public var duration: TimeInterval?
    /// The call app the recording started for, such as "Zoom".
    public var app: String
    /// The sides that were recorded.
    public var captured: Set<Track>

    public init(id: CallID = CallID(), start: Date, duration: TimeInterval? = nil, app: String, captured: Set<Track>) {
        self.id = id
        self.start = start
        self.duration = duration
        self.app = app
        self.captured = captured
    }
}

/// A side of the call: the microphone («я») or the call audio («они»).
public enum Track: String, Sendable, CaseIterable, Codable {
    case mic
    case call
}
