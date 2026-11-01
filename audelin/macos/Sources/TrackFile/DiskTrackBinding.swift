import Darwin
import Foundation

protocol TrackFileBinding: Sendable {

    func initialize() throws
    func write(_ samples: [Int16], at frame: Int64) throws
    func read(from frame: Int64, count: Int) throws -> [Float]
    func finalize(frames: Int64) throws
    func remove()
}

/// Positioned I/O keeps readers independent of the append position.
final class DiskTrackBinding: TrackFileBinding {

    private let descriptor: Int32
    private let url: URL
    private let positionedWrite: @Sendable (Int32, UnsafeRawBufferPointer, Int64) throws -> Int
    private static let audioOffset: Int64 = 68

    convenience init(url: URL) throws {

        try self.init(url: url, positionedWrite: { descriptor, bytes, offset in
            let size = pwrite(descriptor, bytes.baseAddress, bytes.count, offset)
            guard size >= 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
            return size
        })
    }

    init(
        url: URL,
        positionedWrite: @escaping @Sendable (Int32, UnsafeRawBufferPointer, Int64) throws -> Int
    ) throws {

        descriptor = Darwin.open(url.path, O_CREAT | O_EXCL | O_RDWR | O_CLOEXEC, 0o600)
        guard descriptor >= 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        self.url = url
        self.positionedWrite = positionedWrite
    }

    deinit { Darwin.close(descriptor) }

    func initialize() throws {

        var header = Data("caff".utf8)
        header.appendInteger(UInt16(1))
        header.appendInteger(UInt16(0))
        header.append(contentsOf: "desc".utf8)
        header.appendInteger(UInt64(32))
        header.appendInteger(Double(48_000).bitPattern)
        header.append(contentsOf: "lpcm".utf8)
        header.appendInteger(UInt32(2)) // Signed integer PCM in little-endian order.
        header.appendInteger(UInt32(2))
        header.appendInteger(UInt32(1))
        header.appendInteger(UInt32(1))
        header.appendInteger(UInt32(16))
        header.append(contentsOf: "data".utf8)
        header.appendInteger(UInt64.max)
        header.appendInteger(UInt32(0))
        try writeAll(header, at: 0)
    }

    func write(_ samples: [Int16], at frame: Int64) throws {

        guard !samples.isEmpty else { return }
        let offset = Self.audioOffset + frame * 2
        let bytes = samples.map(\.littleEndian).withUnsafeBytes { Data($0) }
        var info = stat()
        guard fstat(descriptor, &info) == 0 else { throw currentError() }
        let originalEnd = info.st_size
        do { try writeAll(bytes, at: offset) }
        catch {
            guard ftruncate(descriptor, originalEnd) == 0 else { throw currentError() }
            throw error
        }
    }

    func read(from frame: Int64, count: Int) throws -> [Float] {

        var bytes = Data(count: count * 2)
        try bytes.withUnsafeMutableBytes { buffer in
            var done = 0
            while done < buffer.count {
                let size = pread(descriptor, buffer.baseAddress!.advanced(by: done), buffer.count - done,
                                 Self.audioOffset + frame * 2 + Int64(done))
                if size < 0 {
                    if errno == EINTR { continue }
                    throw currentError()
                }
                guard size > 0 else { throw POSIXError(.EIO) }
                done += size
            }
        }
        return stride(from: 0, to: bytes.count, by: 2).map { index in
            Float(Int16(bitPattern: UInt16(bytes[index]) | UInt16(bytes[index + 1]) << 8)) / 32_768
        }
    }

    func finalize(frames: Int64) throws {

        var length = Data()
        length.appendInteger(UInt64(frames * 2 + 4))
        do { try writeAll(length, at: 56) }
        catch {
            // Restore the open-ended header if sealing its length only partly succeeded.
            try? writeAll(Data(repeating: 0xff, count: 8), at: 56)
            throw error
        }
    }

    func remove() { _ = unlink(url.path) }

    private func writeAll(_ bytes: Data, at offset: Int64) throws {

        try bytes.withUnsafeBytes { buffer in
            var done = 0
            while done < buffer.count {
                let size: Int
                do {
                    size = try positionedWrite(descriptor, UnsafeRawBufferPointer(rebasing: buffer[done...]), offset + Int64(done))
                } catch let error as POSIXError where error.code == .EINTR {
                    continue
                }
                guard size > 0 else { throw POSIXError(.EIO) }
                done += size
            }
        }
    }

    private func currentError() -> POSIXError {

        POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
    }
}

private extension Data {

    mutating func appendInteger<T: FixedWidthInteger>(_ value: T) {

        var bytes = value.bigEndian
        Swift.withUnsafeBytes(of: &bytes) { append(contentsOf: $0) }
    }
}
