import Foundation
import Dispatch

@MainActor final class AirRecorder {
    private let append: (Data) -> Void
    init(append: @escaping (Data) -> Void) { self.append = append }
    func record(_ bytes: [UInt8], direction: String, enabled: Bool) {
        guard enabled else { return }
        let record = ["direction": direction, "hex": bytes.map { String(format: "%02x", $0) }.joined()]
        // Both keys and values are strings, so encoding cannot reject a frame.
        guard var line = try? JSONEncoder().encode(record) else { return }
        line.append(10)
        append(line)
    }
}

/// A serial queue preserves frame order and keeps blocking file I/O off the actor.
@MainActor final class AirFile {
    private let queue = DispatchQueue(label: "mizan.rehearsal.air")
    private let path: URL
    private var pending: Task<Void, Never>?
    init(path: URL) { self.path = path }
    func append(_ data: Data) {
        let previous = pending
        let path = path, queue = queue
        pending = Task {
            await previous?.value
            await Self.write(data, to: path, on: queue)
        }
    }
    private nonisolated static func write(_ data: Data, to path: URL, on queue: DispatchQueue) async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            queue.async {
                defer { continuation.resume() }
                do {
                    if !FileManager.default.fileExists(atPath: path.path) {
                        try Data().write(to: path, options: .withoutOverwriting)
                    }
                    let file = try FileHandle(forWritingTo: path)
                    defer { try? file.close() }
                    try file.seekToEnd()
                    try file.write(contentsOf: data)
                } catch {
                    // A missing or incomplete recording fails the independent checker.
                    // Air bytes and file errors never enter the diagnostic log.
                }
            }
        }
    }
    func flush() async { await pending?.value }
}
