import Calls
import CallsStorage
import Foundation
import Synchronization
import Testing
import TranscriptFile
import TranscriptFormat
@testable import Composer

/// The merge port's chain over real call folders: each part a saved transcript and
/// tracks ten seconds long, the second starting a minute after the first.
@Suite(.timeLimit(.minutes(1)))
struct MergeChainTests {
    private let first = "1970.01.01-1000", second = "1970.01.01-1001"

    @Test func joinsThePartsTranscriptsIntoTheEarliestCallAndForgetsThePartsNotes() async throws {
        try await withComposeFolder { root in
            try call(first, in: root, [.init(side: .mine, start: 1, settled: "hello", pending: "")])
            try call(second, in: root, [.init(side: .theirs, start: 2, settled: "hi", pending: "", speaker: "s1")],
                     speakers: [.init(id: "s1", name: "Ann", state: "named")])
            let forgotten = Mutex<[String]>([])
            let sut = SummaryCalls(storage: storage(root),
                                   deleted: { id in forgotten.withLock { $0.append(id) } })

            #expect(try await sut.merge(ids: [second, first]) == first)

            #expect(try await sut.list().map(\.id) == [first])
            let joined = TranscriptFormat.read(try String(contentsOf: root.appendingPathComponent("\(first)/transcript.md"), encoding: .utf8))
            #expect(joined.segments == [.init(side: .mine, start: 1, settled: "hello", pending: ""),
                                        .gap(at: 10, length: 50),
                                        .init(side: .theirs, start: 62, settled: "hi", pending: "", speaker: "2.s1")])
            #expect(joined.speakers == [.init(id: "2.s1", name: "Ann", state: "named")])
            #expect(forgotten.withLock { $0 } == [second, first])
        }
    }

    @Test func aFailedWriteLeavesThePartsAndWritesNothing() async throws {
        try await withComposeFolder { root in
            try call(first, in: root, [.init(side: .mine, start: 1, settled: "hello", pending: "")])
            try call(second, in: root, [.init(side: .mine, start: 1, settled: "again", pending: "")])
            let forgotten = Mutex<[String]>([])
            let sut = SummaryCalls(storage: storage(root),
                                   deleted: { id in forgotten.withLock { $0.append(id) } }, binding: FailingBinding())

            let failure = await #expect(throws: CallsFailure.self) { _ = try await sut.merge(ids: [first, second]) }
            guard case .mergeFailed(step: .writingTranscript, _) = failure else {
                Issue.record("expected a failed write, got \(String(describing: failure))"); return
            }

            #expect(try await sut.list().map(\.id) == [second, first])
            #expect(forgotten.withLock { $0 }.isEmpty)
        }
    }

    private func call(_ id: String, in root: URL, _ segments: [TranscriptFormat.Segment], speakers: [TranscriptFormat.Speaker] = []) throws {
        let folder = root.appendingPathComponent(id)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false)
        var format = TranscriptFormat()
        let text = try format.render(segments, speakers: speakers).chunks.reduce(Data(), +)
        try text.write(to: folder.appendingPathComponent("transcript.md"))
        try Data().write(to: folder.appendingPathComponent("call.caf"))
    }

    private func storage(_ root: URL) -> CallsStorage {
        var disk = CallsDisk.system
        disk.trash = removeForTrash
        return CallsStorage(folder: root, journal: nil, makeCalls: { [disk] in
            Calls(folder: $0, timeZone: .gmt, duration: { _ in 10 }, transcript: transcriptLines, disk: disk)
        })
    }
}

private struct FailingBinding: TranscriptFileBinding {
    func create(at url: URL) throws -> any TranscriptFileHandle { throw CocoaError(.fileWriteOutOfSpace) }
    func open(at url: URL) throws -> any TranscriptFileHandle { throw CocoaError(.fileWriteOutOfSpace) }
    func rename(from source: URL, to target: URL) throws {}
    func remove(at url: URL) {}
}
