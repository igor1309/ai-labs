import Darwin
import Foundation

// Package visibility lets the crash writer pause the same binding used by the adapter.
package protocol TranscriptFileBinding: Sendable {

    func create(at url: URL) throws -> any TranscriptFileHandle
    func rename(from source: URL, to target: URL) throws
    func remove(at url: URL)
}

package protocol TranscriptFileHandle: Sendable {

    func write(_ data: Data) throws
    func flush() throws
}

package struct DiskTranscriptBinding: TranscriptFileBinding {

    package init() {}

    package func create(at url: URL) throws -> any TranscriptFileHandle {

        guard url.isFileURL else { throw POSIXError(.EINVAL) }
        let descriptor = Darwin.open(url.path, O_CREAT | O_EXCL | O_NOFOLLOW | O_WRONLY | O_CLOEXEC, 0o600)
        guard descriptor >= 0 else { throw currentError() }
        return DiskTranscriptHandle(descriptor: descriptor)
    }

    package func rename(from source: URL, to target: URL) throws {

        guard Darwin.rename(source.path, target.path) == 0 else { throw currentError() }
    }

    package func remove(at url: URL) { _ = unlink(url.path) }
}

private final class DiskTranscriptHandle: TranscriptFileHandle {

    private let descriptor: Int32

    init(descriptor: Int32) { self.descriptor = descriptor }

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

    func flush() throws {

        while fsync(descriptor) != 0 {
            if errno == EINTR { continue }
            throw currentError()
        }
    }
}

private func currentError() -> POSIXError {

    POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
}
