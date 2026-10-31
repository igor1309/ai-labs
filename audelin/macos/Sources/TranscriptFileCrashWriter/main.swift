import Foundation
import Synchronization
import TranscriptFile

/// The parent kills this process at a reported replacement or rewrite boundary.
private final class PausingBinding: TranscriptFileBinding {

    let point: String
    private let disk = DiskTranscriptBinding()
    private let opens = Mutex(0)

    init(point: String) {

        self.point = point
    }

    func create(at url: URL) throws -> any TranscriptFileHandle { try disk.create(at: url) }

    func open(at url: URL) throws -> any TranscriptFileHandle {

        let base = try disk.open(at: url)
        // The first write replaces the file whole; the second and third rewrite after its final text.
        let count = opens.withLock { count in
            count += 1
            return count
        }
        return count == 2 ? PausingHandle(base: base, point: point, binding: self) : base
    }

    func rename(from source: URL, to target: URL) throws {

        let text = try String(contentsOf: source, encoding: .utf8)
        let chosen = text.contains("3 mine settled")
        if chosen && point == "before" { try pause() }
        try disk.rename(from: source, to: target)
        if chosen && point == "after" { try pause() }
    }

    func remove(at url: URL) { disk.remove(at: url) }

    func pause() throws {

        try FileHandle.standardOutput.write(contentsOf: Data("paused \(point)\n".utf8))
        // The parent owns stdin and keeps it open until it kills or cancels the helper.
        _ = try FileHandle.standardInput.read(upToCount: 1)
        throw CocoaError(.userCancelled)
    }
}

private struct PausingHandle: TranscriptFileHandle {

    let base: any TranscriptFileHandle
    let point: String
    let binding: PausingBinding

    func write(_ data: Data) throws { try base.write(data) }

    func truncate(to length: Int) throws {

        try base.truncate(to: length)
        if point == "truncated" { try binding.pause() }
    }

    func flush() throws {

        if point == "written" { try binding.pause() }
        try base.flush()
    }
}

let url = URL(fileURLWithPath: CommandLine.arguments[1])
let point = CommandLine.arguments[2]
let file = try await TranscriptFile(url: url, binding: PausingBinding(point: point))
for number in 1...3 {
    let segments: [TranscriptFile.Segment] = [
        .init(side: .mine, start: 1, settled: "\(number) mine settled", pending: "\(number) mine pending"),
        .init(side: .theirs, start: 2, settled: "\(number) theirs settled", pending: "\(number) theirs pending"),
    ]
    if point == "truncated" || point == "written" {
        // The first segment is final and never changes; only the second is rewritten.
        let final = TranscriptFile.Segment(side: .mine, start: 1, settled: "final", pending: "")
        try await file.write(count: 2, finalCount: 1) { $0 == 0 ? final : segments[1] }
    } else {
        try await file.write(segments)
    }
    try FileHandle.standardOutput.write(contentsOf: Data("returned \(number)\n".utf8))
}
