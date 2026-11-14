import Foundation
import RecordingConditions

/// Reads the current calls folder from the disk: whether it is a directory, writable, and its free capacity.
public struct DiskReadingsAdapter: Sendable {

    private let folder: @Sendable () -> URL
    private let capacity: any FolderCapacity

    public init(folder: @escaping @Sendable () -> URL, capacity: any FolderCapacity) {
        self.folder = folder
        self.capacity = capacity
    }

    /// Capacity is read only for an existing folder.
    public func read() -> DiskReadings {

        let url = folder()
        var directory: ObjCBool = false
        let exists = FileManager.default.fileExists(atPath: url.path, isDirectory: &directory) && directory.boolValue
        guard exists else { return DiskReadings(folderExists: false, writable: false, availableCapacity: nil) }
        return DiskReadings(
            folderExists: true, writable: FileManager.default.isWritableFile(atPath: url.path),
            availableCapacity: capacity.available(at: url)
        )
    }
}
