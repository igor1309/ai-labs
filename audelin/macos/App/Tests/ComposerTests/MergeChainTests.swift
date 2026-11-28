import CallTags
import Calls
import CallsStorage
import Foundation
import SummaryFiles
import SummaryJobs
import TagsFile
import Testing
import TranscriptFile
import TranscriptFormat
@testable import Composer

/// The merge port's chain over real call folders: each part a saved transcript and
/// tracks ten seconds long, the second starting a minute after the first.
@Suite(.timeLimit(.minutes(1)))
struct MergeChainTests {
    private let first = "1970.01.01-1000", second = "1970.01.01-1001"

    @Test func joinsThePartsTranscriptsAndStagesTheNotesJob() async throws {
        try await withComposeFolder { root in
            try call(first, in: root, [.init(side: .mine, start: 1, settled: "hello", pending: "")])
            try call(second, in: root, [.init(side: .theirs, start: 2, settled: "hi", pending: "", speaker: "s1")],
                     speakers: [.init(id: "s1", name: "Ann", state: "named")])
            let storage = storage(root)
            let sut = SummaryCalls(storage: storage, release: testTranscriptBuild.release, deleted: { _ in }, notes: replacementNotes())

            #expect(try await sut.merge(ids: [second, first]) == first)

            #expect(try await sut.list().map(\.id) == [first])
            let joined = TranscriptFormat.read(try String(contentsOf: root.appendingPathComponent("\(first)/transcript.md"), encoding: .utf8))
            #expect(joined.segments == [.init(side: .mine, start: 1, settled: "hello", pending: ""),
                                        .gap(at: 10, length: 50),
                                        .init(side: .theirs, start: 62, settled: "hi", pending: "", speaker: "2.s1")])
            #expect(joined.speakers == [.init(id: "2.s1", name: "Ann", state: "named")])
            let notes = try #require(await summaryFiles(storage, root: root).load(call: first))
            let saved = try SummariesFilesPort.saved(notes)
            #expect(saved.stage == .pending)
            #expect(saved.job.call == first && saved.job.speakersNamed)
            #expect(saved.job.transcriptIdentity == (try await storage.transcriptFacts(id: first)).identity)
            #expect(saved.job.entries == [.init(label: "Me", time: "1.0", text: "hello"), .init(label: "Them (Ann)", time: "62.0", text: "hi")])
        }
    }

    @Test(arguments: [(false, true), (true, false)])
    func anIneligibleMergePublishesWithoutAJob(notesOn: Bool, usable: Bool) async throws {
        try await withComposeFolder { root in
            let rows: [TranscriptFormat.Segment] = usable ? [.init(side: .mine, start: 1, settled: "hello", pending: "")] : []
            try call(first, in: root, rows)
            try call(second, in: root, rows)
            let storage = storage(root)
            let sut = SummaryCalls(storage: storage, release: testTranscriptBuild.release,
                                   deleted: { _ in }, notes: replacementNotes(enabled: notesOn))

            #expect(try await sut.merge(ids: [first, second]) == first)
            #expect(try await sut.list().map(\.id) == [first])
            #expect(try await summaryFiles(storage, root: root).load(call: first) == nil)
        }
    }

    @Test func aFailedWriteLeavesThePartsAndWritesNothing() async throws {
        try await withComposeFolder { root in
            try call(first, in: root, [.init(side: .mine, start: 1, settled: "hello", pending: "")])
            try call(second, in: root, [.init(side: .mine, start: 1, settled: "again", pending: "")])
            let sut = SummaryCalls(storage: storage(root), release: testTranscriptBuild.release, deleted: { _ in },
                                   notes: replacementNotes(), binding: FailingBinding())

            let failure = await #expect(throws: CallsFailure.self) { _ = try await sut.merge(ids: [first, second]) }
            guard case .mergeFailed(step: .writingTranscript, _) = failure else {
                Issue.record("expected a failed write, got \(String(describing: failure))"); return
            }

            #expect(try await sut.list().map(\.id) == [second, first])
            for id in [first, second] {
                #expect(try await summaryFiles(sut.storage, root: root).load(call: id) == nil)
            }
        }
    }

    @Test func theMergedCallHasEveryPartsTagsOnceEarliestFirst() async throws {
        try await withComposeFolder { root in
            try call(first, in: root, [.init(side: .mine, start: 1, settled: "hello", pending: "")])
            try call(second, in: root, [.init(side: .mine, start: 1, settled: "again", pending: "")])
            try TagsFile.write(["клиент", "банк"], in: root.appendingPathComponent(first))
            try TagsFile.write(["Банк", "найм"], in: root.appendingPathComponent(second))
            let sut = SummaryCalls(storage: storage(root), release: testTranscriptBuild.release, deleted: { _ in })

            #expect(try await sut.merge(ids: [second, first]) == first)

            #expect(try TagsFile.read(in: root.appendingPathComponent(first)) == ["клиент", "банк", "найм"])
        }
    }

    @Test func aPartWithUnreadableTagsFailsTheMergeAndLeavesTheParts() async throws {
        try await withComposeFolder { root in
            try call(first, in: root, [.init(side: .mine, start: 1, settled: "hello", pending: "")])
            try call(second, in: root, [.init(side: .mine, start: 1, settled: "again", pending: "")])
            try TagsFile.write(["клиент"], in: root.appendingPathComponent(first))
            try Data([0xFF, 0xFE]).write(to: root.appendingPathComponent("\(second)/tags.txt"))
            let sut = SummaryCalls(storage: storage(root), release: testTranscriptBuild.release, deleted: { _ in }, notes: replacementNotes())

            let failure = await #expect(throws: CallsFailure.self) { _ = try await sut.merge(ids: [first, second]) }
            guard case .mergeFailed(step: .writingTranscript, _) = failure else {
                Issue.record("expected a failed write, got \(String(describing: failure))"); return
            }

            #expect(try await sut.list().map(\.id) == [second, first])
            #expect(try TagsFile.read(in: root.appendingPathComponent(first)) == ["клиент"])
            for id in [first, second] {
                #expect(try await summaryFiles(sut.storage, root: root).load(call: id) == nil)
            }
        }
    }

    @Test(arguments: [false, true])
    func remergeKeepsOriginalOriginsAndExpandsLegacyOriginalStarts(legacy: Bool) async throws {
        try await withComposeFolder { root in
            let third = "1970.01.01-1002"
            let originA = TranscriptFormat.CallOrigin(hearing: .init(version: "first-version", build: "first-build"), mine: "first-mine", theirs: "first-theirs")
            let originB = TranscriptFormat.CallOrigin(hearing: .init(version: "second-version", build: "second-build"), mine: "second-mine", theirs: "second-theirs")
            try call(first, in: root, [.init(side: .mine, start: 1, settled: "first words", pending: "")],
                     origin: .init(calls: [.init(start: Date(timeIntervalSince1970: 36000), origin: originA)]))
            try call(second, in: root, [.init(side: .theirs, start: 2, settled: "second words", pending: "")],
                     origin: .init(calls: [.init(start: Date(timeIntervalSince1970: 36060), origin: originB)]))
            let calls = storage(root)
            let sut = SummaryCalls(storage: calls, release: testTranscriptBuild.release, deleted: { _ in })
            if legacy {
                _ = try await calls.merge(ids: [first, second]) { folder, _ in
                    try Data("# Transcript\n\n**Me** 00:00:01\nlegacy merged words\n".utf8).write(to: folder.appendingPathComponent("transcript.md"))
                }
            } else { _ = try await sut.merge(ids: [second, first]) }
            try call(third, in: root, [.init(side: .mine, start: 3, settled: "old words", pending: "")])
            _ = try await sut.merge(ids: [third, first])
            let saved = TranscriptFormat.read(try String(contentsOf: root.appendingPathComponent("\(first)/transcript.md"), encoding: .utf8))
            #expect(saved.origin == .init(calls: [
                .init(start: Date(timeIntervalSince1970: 36000), origin: legacy ? nil : originA),
                .init(start: Date(timeIntervalSince1970: 36060), origin: legacy ? nil : originB),
                .init(start: Date(timeIntervalSince1970: 36120), origin: nil)], mergedBy: testTranscriptBuild.release))
            #expect(saved.segments.last?.settled == "old words")
        }
    }

    private func call(_ id: String, in root: URL, _ segments: [TranscriptFormat.Segment], speakers: [TranscriptFormat.Speaker] = [], origin: TranscriptFormat.Origin? = nil) throws {
        let folder = root.appendingPathComponent(id)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false)
        var format = TranscriptFormat()
        let text = try format.render(segments, speakers: speakers, origin: origin).chunks.reduce(Data(), +)
        try text.write(to: folder.appendingPathComponent("transcript.md"))
        try Data().write(to: folder.appendingPathComponent("call.caf"))
    }

    private func storage(_ root: URL) -> CallsStorage {
        var disk = CallsDisk.system
        disk.trash = removeForTrash
        let makeCalls: @Sendable (URL) -> Calls = { [disk] in
            Calls(folder: $0, timeZone: .gmt, duration: { _ in 10 }, transcript: transcriptLines, disk: disk)
        }
        return CallsStorage(folder: root, journal: nil,
            readPart: { folder, id in try storedMergePart(makeCalls(folder.deletingLastPathComponent()), id: id) },
            makeCalls: makeCalls)
    }
}

private struct FailingBinding: TranscriptFileBinding {
    func create(at url: URL) throws -> any TranscriptFileHandle { throw CocoaError(.fileWriteOutOfSpace) }
    func open(at url: URL) throws -> any TranscriptFileHandle { throw CocoaError(.fileWriteOutOfSpace) }
    func rename(from source: URL, to target: URL) throws {}
    func remove(at url: URL) {}
}
