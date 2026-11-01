import Foundation

/// The app's own lines, beside FluidAudio's: to stderr and to a file, so a
/// run can be read back after it.
enum Log {

    static let file = URL(fileURLWithPath: "/tmp/audelin-probe/live-text-preview.log")

    nonisolated(unsafe) private static var handle: FileHandle? = {
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        FileManager.default.createFile(atPath: file.path, contents: nil)
        return try? FileHandle(forWritingTo: file)
    }()
    private static let lock = NSLock()

    static func line(_ text: String) {

        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss.SSS"
        let data = Data("[\(formatter.string(from: Date()))] [LiveTextPreview] \(text)\n".utf8)
        lock.lock()
        defer { lock.unlock() }
        FileHandle.standardError.write(data)
        handle?.write(data)
    }
}
