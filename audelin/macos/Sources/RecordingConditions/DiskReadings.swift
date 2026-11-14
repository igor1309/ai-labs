/// What the disk says about the calls folder at one moment.
public struct DiskReadings: Equatable, Sendable {

    public var folderExists: Bool
    public var writable: Bool
    /// Bytes available to the folder; nil when the disk gave no answer.
    public var availableCapacity: Int64?

    public init(folderExists: Bool, writable: Bool, availableCapacity: Int64?) {
        self.folderExists = folderExists
        self.writable = writable
        self.availableCapacity = availableCapacity
    }
}

/// A recording needs at least 30 decimal gigabytes free in an existing calls folder.
public func hasRoom(_ readings: DiskReadings) -> Bool {

    guard readings.folderExists, let bytes = readings.availableCapacity else { return false }
    return bytes >= 30 * 1_000_000_000
}
