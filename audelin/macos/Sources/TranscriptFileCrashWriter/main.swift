import Foundation
import TranscriptFile

/// The parent kills this process at a reported replacement boundary.
private struct PausingBinding: TranscriptFileBinding {

    let point: String
    private let disk = DiskTranscriptBinding()

    init(point: String) {

        self.point = point
    }

    func create(at url: URL) throws -> any TranscriptFileHandle { try disk.create(at: url) }

    func rename(from source: URL, to target: URL) throws {

        let text = try String(contentsOf: source, encoding: .utf8)
        let chosen = text.contains("3 mine settled")
        if chosen && point == "before" { try pause() }
        try disk.rename(from: source, to: target)
        if chosen && point == "after" { try pause() }
    }

    func remove(at url: URL) { disk.remove(at: url) }

    private func pause() throws {

        try FileHandle.standardOutput.write(contentsOf: Data("paused \(point)\n".utf8))
        // The parent owns stdin and keeps it open until it kills or cancels the helper.
        _ = try FileHandle.standardInput.read(upToCount: 1)
        throw CocoaError(.userCancelled)
    }
}

let url = URL(fileURLWithPath: CommandLine.arguments[1])
let point = CommandLine.arguments[2]
let file = try TranscriptFile(url: url, binding: PausingBinding(point: point))
for number in 1...3 {
    try await file.write([
        .init(side: .mine, start: 1, settled: "\(number) mine settled", pending: "\(number) mine pending"),
        .init(side: .theirs, start: 2, settled: "\(number) theirs settled", pending: "\(number) theirs pending"),
    ])
    try FileHandle.standardOutput.write(contentsOf: Data("returned \(number)\n".utf8))
}
