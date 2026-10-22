import CallDomain
import Darwin
import Foundation
import LiveSessionCore

/// A stand-in for FileCallStore's call-files port in the recorder's tests:
/// call folders under `root`, each found by an `id` file inside it.
public final class TempCallFiles: CallFiles, @unchecked Sendable {
    public let root: URL

    public init(root: URL) { self.root = root }

    /// Makes a call folder named `name` for `call`.
    @discardableResult
    public func makeFolder(_ name: String, for call: CallID) throws -> URL {
        let folder = root.appendingPathComponent(name)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try Data(call.description.utf8).write(to: folder.appendingPathComponent("id"))
        return folder
    }

    public func folder(of call: CallID) throws(CallFileError) -> URL {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: root.path)) ?? []
        for name in names {
            let folder = root.appendingPathComponent(name)
            if let id = try? String(contentsOf: folder.appendingPathComponent("id"), encoding: .utf8),
               id == call.description {
                return folder
            }
        }
        throw .folderGone
    }

    public func create(_ path: String, in call: CallID) throws(CallFileError) -> any CallFile {
        let url = try folder(of: call).appendingPathComponent(path)
        do {
            try FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        } catch {
            throw .failed("\(error)")
        }
        let fd = open(url.path, O_WRONLY | O_CREAT | O_TRUNC, 0o644)
        guard fd >= 0 else { throw Self.error(errno) }
        return TempFile(fd: fd)
    }

    public func paths(in directory: String, of call: CallID) throws(CallFileError) -> [String] {
        let url = try folder(of: call).appendingPathComponent(directory)
        let names = (try? FileManager.default.contentsOfDirectory(atPath: url.path)) ?? []
        return names.map { "\(directory)/\($0)" }
    }

    public func size(of path: String, in call: CallID) throws(CallFileError) -> Int {
        let url = try folder(of: call).appendingPathComponent(path)
        var info = stat()
        guard stat(url.path, &info) == 0 else { throw Self.error(errno) }
        return Int(info.st_size)
    }

    public func read(_ path: String, in call: CallID, offset: Int, count: Int) throws(CallFileError) -> Data {
        let url = try folder(of: call).appendingPathComponent(path)
        guard let handle = try? FileHandle(forReadingFrom: url) else { throw .folderGone }
        defer { try? handle.close() }
        do {
            try handle.seek(toOffset: UInt64(offset))
            return try handle.read(upToCount: count) ?? Data()
        } catch {
            throw .failed("\(error)")
        }
    }

    static func error(_ code: Int32) -> CallFileError {
        switch code {
        case ENOSPC: .diskFull
        case ENOENT: .folderGone
        default: .failed(String(cString: strerror(code)))
        }
    }
}

final class TempFile: CallFile, @unchecked Sendable {
    private let fd: Int32

    init(fd: Int32) { self.fd = fd }

    var size: Int {
        var info = stat()
        fstat(fd, &info)
        return Int(info.st_size)
    }

    func append(_ data: Data) throws(CallFileError) {
        try checkLinked()
        try write(data, at: size)
    }

    func write(_ data: Data, at offset: Int) throws(CallFileError) {
        var done = 0
        while done < data.count {
            let written = data.withUnsafeBytes { bytes in
                pwrite(fd, bytes.baseAddress! + done, data.count - done, off_t(offset + done))
            }
            guard written >= 0 else { throw TempCallFiles.error(errno) }
            done += written
        }
    }

    func truncate(to size: Int) throws(CallFileError) {
        guard ftruncate(fd, off_t(size)) == 0 else { throw TempCallFiles.error(errno) }
    }

    func close() { Darwin.close(fd) }

    /// A file whose folder was deleted has no links left.
    private func checkLinked() throws(CallFileError) {
        var info = stat()
        guard fstat(fd, &info) == 0 else { throw TempCallFiles.error(errno) }
        if info.st_nlink == 0 { throw .folderGone }
    }
}
