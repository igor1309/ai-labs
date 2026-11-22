import Darwin
import Foundation

public struct FileDisk: Disk {
    public init() {}
    public func createFolder(_ folder: URL) throws -> Bool {
        try FileManager.default.createDirectory(at: folder.deletingLastPathComponent(), withIntermediateDirectories: true)
        if mkdir(folder.path, 0o755) == 0 { return true }
        if errno == EEXIST { return false }
        throw POSIXError(.init(rawValue: errno) ?? .EIO)
    }
    public func files(_ folder: URL) throws -> [String] { try FileManager.default.contentsOfDirectory(atPath: folder.path) }
    public func read(_ file: URL) throws -> String { try String(contentsOf: file, encoding: .utf8) }
    public func write(_ text: String, to file: URL) throws { try text.write(to: file, atomically: true, encoding: .utf8) }
}
