import Darwin
import Foundation

// The binding lets callers inject write failures while composing the real adapter.
public protocol TranscriptFileBinding: Sendable {

    func create(at url: URL) throws -> any TranscriptFileHandle
    /// Opens an existing file, never through a symlink, so each write lands at its end.
    func open(at url: URL) throws -> any TranscriptFileHandle
    func rename(from source: URL, to target: URL) throws
    func remove(at url: URL)
}

public protocol TranscriptFileHandle: Sendable {

    func write(_ data: Data) throws
    func truncate(to length: Int) throws
    func flush() throws
}

public struct DiskTranscriptBinding: TranscriptFileBinding {

    /// Returns zero or sets `errno`, as `fsync` does.
    package typealias Sync = @Sendable (Int32) -> Int32

    private let sync: Sync

    public init() { self.sync = { fsync($0) } }

    package init(sync: @escaping Sync) { self.sync = sync }

    public func create(at url: URL) throws -> any TranscriptFileHandle {

        guard url.isFileURL else { throw POSIXError(.EINVAL) }
        let descriptor = Darwin.open(url.path, O_CREAT | O_EXCL | O_NOFOLLOW | O_WRONLY | O_CLOEXEC, 0o600)
        guard descriptor >= 0 else { throw currentError() }
        return DiskTranscriptHandle(descriptor: descriptor, sync: sync)
    }

    public func open(at url: URL) throws -> any TranscriptFileHandle {

        guard url.isFileURL else { throw POSIXError(.EINVAL) }
        let descriptor = Darwin.open(url.path, O_APPEND | O_NOFOLLOW | O_WRONLY | O_CLOEXEC)
        guard descriptor >= 0 else { throw currentError() }
        return DiskTranscriptHandle(descriptor: descriptor, sync: sync)
    }

    public func rename(from source: URL, to target: URL) throws {

        guard Darwin.rename(source.path, target.path) == 0 else { throw currentError() }
    }

    public func remove(at url: URL) { _ = unlink(url.path) }
}

private final class DiskTranscriptHandle: TranscriptFileHandle {

    private let descriptor: Int32
    private let sync: DiskTranscriptBinding.Sync

    init(descriptor: Int32, sync: @escaping DiskTranscriptBinding.Sync) {

        self.descriptor = descriptor
        self.sync = sync
    }

    deinit { Darwin.close(descriptor) }

    func write(_ data: Data) throws {

        try data.withUnsafeBytes { buffer in
            var done = 0
            while done < buffer.count {
                let size = Darwin.write(descriptor, buffer.baseAddress!.advanced(by: done), buffer.count - done)
                if size < 0 {
                    if errno == EINTR { continue }
                    throw currentError()
                }
                guard size > 0 else { throw POSIXError(.EIO) }
                done += size
            }
        }
    }

    func truncate(to length: Int) throws {

        while ftruncate(descriptor, off_t(length)) != 0 {
            if errno == EINTR { continue }
            throw currentError()
        }
    }

    func flush() throws {

        while sync(descriptor) != 0 {
            if errno == EINTR { continue }
            throw currentError()
        }
    }
}

private func currentError() -> POSIXError {

    POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
}
