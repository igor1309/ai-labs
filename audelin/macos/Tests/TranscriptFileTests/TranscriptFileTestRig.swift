import Foundation
import Synchronization
import Testing
@testable import TranscriptFile

let noTextTranscript = "# Transcript\n\nNo text was heard.\n"

func withTranscriptFolder(_ body: (URL) async throws -> Void) async throws {

    let folder = FileManager.default.temporaryDirectory.appendingPathComponent("TranscriptFileTests-\(UUID())", isDirectory: true)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false)
    defer { try? FileManager.default.removeItem(at: folder) }
    try await body(folder)
}

func transcriptText(_ url: URL) throws -> String {

    try String(contentsOf: url, encoding: .utf8)
}

func folderNames(_ folder: URL) throws -> [String] {

    try FileManager.default.contentsOfDirectory(atPath: folder.path).sorted()
}

func numberedSegments(_ number: Int) -> [TranscriptFile.Segment] {

    [
        .init(side: .mine, start: 1, settled: "\(number) mine settled", pending: "\(number) mine pending"),
        .init(side: .theirs, start: 2, settled: "\(number) theirs settled", pending: "\(number) theirs pending"),
    ]
}

func numberedTranscript(_ number: Int) -> String {

    "# Transcript\n\n**Me** 00:00:01\n\(number) mine settled \(number) mine pending\n\n**Them** 00:00:02\n\(number) theirs settled \(number) theirs pending\n"
}

enum TranscriptFault: CaseIterable, Sendable {

    case create, write, flush, rename
}

struct TranscriptBindingFailure: Error {}

final class FailingTranscriptBinding: TranscriptFileBinding {

    private let fault = Mutex<TranscriptFault?>(nil)
    private let disk = DiskTranscriptBinding()

    func arm(_ point: TranscriptFault) { fault.withLock { $0 = point } }

    func check(_ point: TranscriptFault) throws {

        let fails = fault.withLock { value in
            guard value == point else { return false }
            value = nil
            return true
        }
        if fails { throw TranscriptBindingFailure() }
    }

    func create(at url: URL) throws -> any TranscriptFileHandle {

        try check(.create)
        return FailingTranscriptHandle(base: try disk.create(at: url), owner: self)
    }

    func rename(from source: URL, to target: URL) throws {

        try check(.rename)
        try disk.rename(from: source, to: target)
    }

    func remove(at url: URL) { disk.remove(at: url) }
}

private struct FailingTranscriptHandle: TranscriptFileHandle {

    let base: any TranscriptFileHandle
    let owner: FailingTranscriptBinding

    func write(_ data: Data) throws {

        // Leave a real partial file so cleanup is proved after writing has begun.
        try base.write(Data(data.prefix(7)))
        try owner.check(.write)
        try base.write(Data(data.dropFirst(7)))
    }

    func flush() throws {

        try owner.check(.flush)
        try base.flush()
    }
}
