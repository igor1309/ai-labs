import Foundation
import Synchronization
import Testing
import TranscriptFile
import TranscriptFormat
@testable import CallText
@testable import Composer

@Suite(.timeLimit(.minutes(1)))
struct TranscriptRenderingTests {

    @Test func aWriteThatFailsToRenderMakesTheNextWriteReplaceTheFileWhole() async throws {

        try await withComposeFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let binding = RecordingTranscriptBinding()
            var initial = TranscriptFormat()
            let file = try await TranscriptFile(url: url, initialBytes: try initial.render([]).chunks, binding: binding)
            let writer = WritingTranscript(file: file, format: TranscriptFormat(), names: LiveNameBoard(), sink: RenderingLog())
            let final = CallState.Entry(speaker: .mine, text: .init(id: 0, start: 1, end: 2, settled: "1 final"), writtenLater: false)
            func snapshot(start: Double, words: String) -> CallState {
                .init(status: .listening, entries: [final, .init(speaker: .theirs, text: .init(id: 1, start: start, end: 3, pending: words), writtenLater: false)], finalCount: 1)
            }
            try await writer.write(snapshot(start: 2, words: "2 pending"))
            try await writer.write(snapshot(start: 2, words: "2 growing"))
            #expect(binding.take() == ["create", "create", "rename", "open"])
            let before = try Data(contentsOf: url)
            await #expect(throws: TranscriptFormat.Failure.invalidStart) {
                try await writer.write(snapshot(start: .nan, words: "bad"))
            }
            #expect(try Data(contentsOf: url) == before)
            #expect(binding.take().isEmpty)
            try await writer.write(snapshot(start: 2, words: "3 recovered"))
            #expect(binding.take() == ["create", "rename"])
            #expect(try String(contentsOf: url, encoding: .utf8) == "# Transcript\n\n**Me** 00:00:01\n1 final\n\n**Them** 00:00:02\n3 recovered\n")
            await writer.close()
        }
    }

    @Test func closingAfterAFailedRenderingEndsFurtherWrites() async throws {

        try await withComposeFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let binding = RecordingTranscriptBinding()
            var initial = TranscriptFormat()
            let file = try await TranscriptFile(url: url, initialBytes: try initial.render([]).chunks, binding: binding)
            let writer = WritingTranscript(file: file, format: TranscriptFormat(), names: LiveNameBoard(), sink: RenderingLog())
            let bad = CallState(status: .listening, entries: [
                .init(speaker: .mine, text: .init(id: 1, start: .nan, end: 3, settled: "bad"), writtenLater: false),
            ])
            await #expect(throws: TranscriptFormat.Failure.invalidStart) { try await writer.write(bad) }
            await writer.close()
            _ = binding.take()
            await #expect(throws: TranscriptFile.Failure.writingEnded) {
                try await writer.write(CallState(status: .finished, entries: []))
            }
            #expect(binding.take().isEmpty)
            #expect(try String(contentsOf: url, encoding: .utf8) == "# Transcript\n\nNo text was heard.\n")
        }
    }

    @Test func speakerNamesMakeEveryWriteReplaceWhole() async throws {

        try await withComposeFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let binding = RecordingTranscriptBinding()
            var initial = TranscriptFormat()
            let file = try await TranscriptFile(url: url, initialBytes: try initial.render([]).chunks, binding: binding)
            let names = LiveNameBoard()
            names.give([1: "Anna"])
            let writer = WritingTranscript(file: file, format: TranscriptFormat(), names: names, sink: RenderingLog())
            let snapshot = CallState(status: .listening, entries: [
                .init(speaker: .theirs, text: .init(id: 1, start: 2, end: 3, settled: "1 hello"), writtenLater: false),
            ], finalCount: 1)
            for revision in 1...2 {
                _ = binding.take()
                try await writer.write(snapshot)
                #expect(binding.take() == ["create", "rename"])
                let text = try String(contentsOf: url, encoding: .utf8)
                #expect(text.contains("**Speaker z1** 00:00:02\n1 hello\n"))
                #expect(text.contains("- Speaker z1: Anna\n"))
                #expect(text.contains("\"revision\":\(revision)"))
            }
            await writer.close()
        }
    }
}

private struct RenderingLog: LogSink {
    func write(_ entry: LogEntry) {}
}

private final class RecordingTranscriptBinding: TranscriptFileBinding {
    private let disk = DiskTranscriptBinding()
    private let steps = Mutex<[String]>([])

    func take() -> [String] {
        steps.withLock { value in
            defer { value = [] }
            return value
        }
    }
    func create(at url: URL) throws -> any TranscriptFileHandle {
        steps.withLock { $0.append("create") }
        return try disk.create(at: url)
    }
    func open(at url: URL) throws -> any TranscriptFileHandle {
        steps.withLock { $0.append("open") }
        return try disk.open(at: url)
    }
    func rename(from source: URL, to target: URL) throws {
        steps.withLock { $0.append("rename") }
        try disk.rename(from: source, to: target)
    }
    func remove(at url: URL) { disk.remove(at: url) }
}
