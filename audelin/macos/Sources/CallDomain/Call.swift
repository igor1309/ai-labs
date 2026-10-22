import Foundation

/// A call's identity: the id in its `meta.json`, never its folder's path.
public struct CallID: Hashable, Sendable, Codable, CustomStringConvertible {
    public let uuid: UUID

    public init(_ uuid: UUID = UUID()) { self.uuid = uuid }

    public var description: String { uuid.uuidString }
}

/// A side of the call: the microphone («я») or the call audio («они»).
public enum Track: String, Sendable, CaseIterable, Codable {
    case mic
    case call
}
