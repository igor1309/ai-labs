import Foundation

/// The directory sees creation/replacement; the file sees edits to the current inode.
@MainActor public struct DirectoryChanges: FileChanges {
    public init() {}
    public func watch(path: String, onChange: @escaping @MainActor @Sendable () -> Void) -> any FileObservation {
        DirectoryObservation(path: path, onChange: onChange)
    }
}

@MainActor private final class DirectoryObservation: FileObservation {
    private struct Stamp: Equatable {
        let inode: UInt64
        let size: Int64
        let modifiedSeconds: Int
        let modifiedNanos: Int
        let changedSeconds: Int
        let changedNanos: Int
        init?(_ path: String) {
            var value = stat()
            guard lstat(path, &value) == 0 else { return nil }
            inode = value.st_ino
            size = value.st_size
            modifiedSeconds = value.st_mtimespec.tv_sec
            modifiedNanos = value.st_mtimespec.tv_nsec
            changedSeconds = value.st_ctimespec.tv_sec
            changedNanos = value.st_ctimespec.tv_nsec
        }
    }
    private let path: String
    private let onChange: @MainActor @Sendable () -> Void
    private var directorySource: (any DispatchSourceFileSystemObject)?
    private var fileSource: (any DispatchSourceFileSystemObject)?
    private var stamp: Stamp?
    private var cancelled = false

    init(path: String, onChange: @escaping @MainActor @Sendable () -> Void) {
        self.path = path; self.onChange = onChange
        stamp = Stamp(path)
        directorySource = watch(URL(filePath: path).deletingLastPathComponent().path)
        fileSource = watch(path)
    }

    private func watch(_ path: String) -> (any DispatchSourceFileSystemObject)? {
        let descriptor = open(path, O_EVTONLY)
        guard descriptor >= 0 else { return nil }
        let source = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: descriptor, eventMask: [.write, .rename, .delete, .attrib, .extend], queue: .main
        )
        source.setEventHandler { [weak self] in
            MainActor.assumeIsolated { self?.changed() }
        }
        source.setCancelHandler { close(descriptor) }
        source.resume()
        return source
    }

    private func changed() {
        guard !cancelled else { return }
        let next = Stamp(path)
        if next?.inode != stamp?.inode {
            fileSource?.cancel()
            fileSource = watch(path)
        }
        guard next != stamp else { return }
        stamp = next
        onChange()
    }

    func cancel() {
        cancelled = true
        directorySource?.cancel()
        fileSource?.cancel()
    }
    isolated deinit { cancel() }
}
