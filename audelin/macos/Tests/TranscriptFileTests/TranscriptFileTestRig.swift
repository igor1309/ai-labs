import BlockingTestWork
import Foundation
import Synchronization
import Testing
@testable import TranscriptFile

let noTextTranscript = "# Transcript\n\nNo text was heard.\n"

func withTranscriptFolder(_ body: (URL) async throws -> Void) async throws {

    let folder = FileManager.default.temporaryDirectory.appendingPathComponent("TranscriptFileTests-\(UUID())", isDirectory: true)
    try await offPool { try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false) }
    do { try await body(folder) } catch {
        await offPool { try? FileManager.default.removeItem(at: folder) }
        throw error
    }
    await offPool { try? FileManager.default.removeItem(at: folder) }
}

func transcriptText(_ url: URL) async throws -> String {

    try await offPool { try String(contentsOf: url, encoding: .utf8) }
}

func folderNames(_ folder: URL) async throws -> [String] {

    try await offPool { try FileManager.default.contentsOfDirectory(atPath: folder.path).sorted() }
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

    case create, open, truncate, write, flush, rename

    /// The steps of replacing the file whole.
    static let replacing: [TranscriptFault] = [.create, .write, .flush, .rename]
    /// The steps of rewriting what follows the final text.
    static let rewriting: [TranscriptFault] = [.open, .truncate, .write, .flush]
}

struct TranscriptBindingFailure: Error {}

final class FailingTranscriptBinding: TranscriptFileBinding {

    private let fault = Mutex<TranscriptFault?>(nil)
    private let disk = DiskTranscriptBinding()

    func arm(_ point: TranscriptFault) { fault.withLock { $0 = point } }

    private let record = Mutex<(steps: [TranscriptFault], bytes: Int)>(([], 0))

    /// The steps and the bytes written since the last call.
    func taken() -> (steps: [TranscriptFault], bytes: Int) {

        record.withLock { record in
            defer { record = ([], 0) }
            return record
        }
    }

    /// An empty write is recorded but never fails, so a fault lands where bytes reach the disk.
    func check(_ point: TranscriptFault, bytes: Int = 0, canFail: Bool = true) throws {

        record.withLock { record in
            record.steps.append(point)
            record.bytes += bytes
        }
        guard canFail else { return }
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

    func open(at url: URL) throws -> any TranscriptFileHandle {

        try check(.open)
        return FailingTranscriptHandle(base: try disk.open(at: url), owner: self)
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
        try owner.check(.write, bytes: data.count, canFail: !data.isEmpty)
        try base.write(Data(data.dropFirst(7)))
    }

    func truncate(to length: Int) throws {

        try owner.check(.truncate)
        try base.truncate(to: length)
    }

    func flush() throws {

        try owner.check(.flush)
        try base.flush()
    }
}
