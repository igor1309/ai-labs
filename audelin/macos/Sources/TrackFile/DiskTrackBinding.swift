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
    private enum Layout {
        static let audioOffset: Int64 = 68
        static let lengthOffset = 56
        static let editCountBytes: UInt64 = 4
        static let bytesPerFrame: Int64 = 2

        static var header: Data {
            var header = Data("caff".utf8)
            header.appendInteger(UInt16(1))
            header.appendInteger(UInt16(0))
            header.append(contentsOf: "desc".utf8)
            header.appendInteger(UInt64(32))
            header.appendInteger(TrackFile.sampleRate.bitPattern)
            header.append(contentsOf: "lpcm".utf8)
            header.appendInteger(UInt32(2)) // Signed integer PCM in little-endian order.
            header.appendInteger(UInt32(bytesPerFrame))
            header.appendInteger(UInt32(1))
            header.appendInteger(UInt32(1))
            header.appendInteger(UInt32(16))
            header.append(contentsOf: "data".utf8)
            header.appendInteger(UInt64.max)
            header.appendInteger(UInt32(0))
            return header
        }
    }

    /// Writes with `pwrite`, reporting its errno.
    static let systemWrite: @Sendable (Int32, UnsafeRawBufferPointer, Int64) throws -> Int = { descriptor, bytes, offset in
        let size = pwrite(descriptor, bytes.baseAddress, bytes.count, offset)
        guard size >= 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        return size
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

        try writeAll(Layout.header, at: 0)
    }

    static func duration(at url: URL) throws -> TimeInterval {

        let opened = try openSaved(at: url)
        defer { Darwin.close(opened.descriptor) }
        return Double(opened.frames) / TrackFile.sampleRate
    }

    static func split(at cut: TimeInterval, source: URL, before: URL, after: URL) throws {
        guard cut.isFinite, cut >= 0 else { throw TrackFile.Failure.invalidRange }
        try Task.checkCancellation()
        let saved: (descriptor: Int32, frames: Int64)
        do { saved = try openSaved(at: source) }
        catch let error as POSIXError where error.code == .ENOENT { return }
        defer { Darwin.close(saved.descriptor) }

        let rate = TrackFile.sampleRate
        let boundary: Int64
        if cut >= Double(saved.frames) / rate {
            boundary = saved.frames
        } else {
            let frame = Int64((cut * rate).rounded(.down))
            // Compare on the time axis so a frame's own timestamp remains a boundary.
            boundary = min(saved.frames, Double(frame) / rate < cut ? frame + 1 : frame)
        }

        let first = try copy(saved.descriptor, frames: 0..<boundary, to: before)
        do { _ = try copy(saved.descriptor, frames: boundary..<saved.frames, to: after) }
        catch {
            first?.remove()
            throw error
        }
    }

    private static func copy(_ source: Int32, frames: Range<Int64>, to url: URL) throws -> DiskTrackBinding? {
        guard !frames.isEmpty else { return nil }
        guard url.isFileURL else { throw TrackFile.Failure.invalidFile }
        let output = try DiskTrackBinding(url: url, positionedWrite: systemWrite)
        do {
            try output.initialize()
            var frame = frames.lowerBound
            while frame < frames.upperBound {
                try Task.checkCancellation()
                let count = min(Int64(TrackFile.sampleRate), frames.upperBound - frame)
                let bytes = try readBytes(descriptor: source, at: byteOffset(of: frame),
                                          count: Int(count * Layout.bytesPerFrame), onEOF: POSIXError(.EIO))
                try output.writeAll(bytes, at: byteOffset(of: frame - frames.lowerBound))
                frame += count
            }
            try Task.checkCancellation()
            try output.finalize(frames: frames.upperBound - frames.lowerBound)
            return output
        } catch {
            output.remove()
            throw error
        }
    }

    static func openSaved(at url: URL) throws -> (descriptor: Int32, frames: Int64) {
        guard url.isFileURL else { throw TrackFile.Failure.invalidFile }
        // Nonblocking open also lets a non-regular input be rejected without waiting on a pipe.
        let descriptor = Darwin.open(url.path, O_RDONLY | O_CLOEXEC | O_NONBLOCK)
        guard descriptor >= 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        var accepted = false
        defer { if !accepted { Darwin.close(descriptor) } }
        var info = stat()
        guard fstat(descriptor, &info) == 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        guard info.st_mode & S_IFMT == S_IFREG, info.st_size >= Layout.audioOffset else {
            throw TrackFile.Failure.invalidFile
        }
        let header = try readBytes(descriptor: descriptor, at: 0, count: Int(Layout.audioOffset),
                                   onEOF: TrackFile.Failure.invalidFile)
        let expected = Layout.header
        let lengthEnd = Layout.lengthOffset + MemoryLayout<UInt64>.size
        guard header[..<Layout.lengthOffset] == expected[..<Layout.lengthOffset],
              header[lengthEnd...] == expected[lengthEnd...] else { throw TrackFile.Failure.invalidFile }
        let length = header[Layout.lengthOffset..<lengthEnd].reduce(UInt64(0)) { ($0 << 8) | UInt64($1) }
        let available = UInt64(info.st_size - Layout.audioOffset)
        if length != UInt64.max {
            // A sealed track ends at its declared data chunk and contains whole frames.
            guard length >= Layout.editCountBytes, length - Layout.editCountBytes == available,
                  available % UInt64(Layout.bytesPerFrame) == 0 else { throw TrackFile.Failure.invalidFile }
        }
        accepted = true
        return (descriptor, Int64(available / UInt64(Layout.bytesPerFrame)))
    }

    func write(_ samples: [Int16], at frame: Int64) throws {

        guard !samples.isEmpty else { return }
        let offset = Self.byteOffset(of: frame)
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
        try Self.read(descriptor: descriptor, from: frame, count: count)
    }

    static func read(descriptor: Int32, from frame: Int64, count: Int) throws -> [Float] {

        let bytes = try readBytes(descriptor: descriptor, at: byteOffset(of: frame),
                                  count: count * Int(Layout.bytesPerFrame), onEOF: POSIXError(.EIO))
        return stride(from: 0, to: bytes.count, by: 2).map { index in
            Float(Int16(bitPattern: UInt16(bytes[index]) | UInt16(bytes[index + 1]) << 8)) / 32_768
        }
    }

    private static func byteOffset(of frame: Int64) -> Int64 { Layout.audioOffset + frame * Layout.bytesPerFrame }

    private static func readBytes(descriptor: Int32, at offset: Int64, count: Int, onEOF: any Error) throws -> Data {
        var bytes = Data(count: count)
        try bytes.withUnsafeMutableBytes { buffer in
            var done = 0
            while done < buffer.count {
                let size = pread(descriptor, buffer.baseAddress!.advanced(by: done), buffer.count - done, offset + Int64(done))
                if size < 0 {
                    if errno == EINTR { continue }
                    throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
                }
                guard size > 0 else { throw onEOF }
                done += size
            }
        }
        return bytes
    }

    func finalize(frames: Int64) throws {

        var length = Data()
        length.appendInteger(UInt64(frames * Layout.bytesPerFrame) + Layout.editCountBytes)
        do { try writeAll(length, at: Int64(Layout.lengthOffset)) }
        catch {
            // Restore the open-ended header if sealing its length only partly succeeded.
            try? writeAll(Data(repeating: 0xff, count: MemoryLayout<UInt64>.size), at: Int64(Layout.lengthOffset))
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
