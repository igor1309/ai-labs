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
        let chosen = text.contains("3 first")
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
        if point.hasPrefix("truncated") { try binding.pause() }
    }

    func flush() throws {

        if point == "written" { try binding.pause() }
        try base.flush()
    }
}

let url = URL(fileURLWithPath: CommandLine.arguments[1])
let point = CommandLine.arguments[2]
let file = try await TranscriptFile(url: url, initialBytes: [Data("0 initial\n".utf8)], binding: PausingBinding(point: point))
for number in 1...3 {
    let final = "1 final\n"
    let tail = "\(number) second\n"
    if point == "truncated" || point == "written" {
        try await file.write([Data(final.utf8), Data(tail.utf8)], finalLength: final.utf8.count)
    } else if point == "truncated after all final" {
        let prefix = number == 3 ? final + "\n" : final
        try await file.write([Data(prefix.utf8), Data((number == 3 ? tail : "").utf8)], finalLength: prefix.utf8.count)
    } else {
        try await file.write([Data("\(number) first\n\(number) second\n".utf8)], finalLength: nil)
    }
    try FileHandle.standardOutput.write(contentsOf: Data("returned \(number)\n".utf8))
}
