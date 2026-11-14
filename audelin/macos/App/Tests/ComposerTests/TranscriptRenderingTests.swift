import LiveText
import Foundation
import Synchronization
import Testing
import TranscriptFile
import TranscriptFormat
@testable import CallText
@testable import Composer

@Suite(.timeLimit(.minutes(1)))
struct TranscriptRenderingTests {

    @Test(arguments: [false, true])
    func microphoneReplacementUsesTheSuppliedFarSideAndNames(attributed: Bool) async throws {

        let bytes = BytesSpy()
        let liveNames = LiveNameBoard()
        liveNames.give([1: "Another call"])
        let writer = WritingTranscript(file: bytes, format: TranscriptFormat(), names: liveNames, sink: RenderingLog())
        let names = LiveNameBoard()
        names.give([1: "Anna"])
        let state = CallState(status: .finished, entries: [
            .init(speaker: .theirs, text: .init(id: 1, start: 0, end: 1, words: [.init("raw far", start: 0, end: 1)], settledCount: 1), writtenLater: true),
            .init(speaker: .mine, text: .init(id: 2, start: 1, end: 2, words: [.init("old microphone", start: 1, end: 2)], settledCount: 1), writtenLater: false),
        ], finalCount: 2)
        let far = AttributedFar(
            far: [
                .init(side: .theirs, start: 0, settled: "attributed far", pending: "", filledInLater: true, speaker: "d0"),
                .init(side: .theirs, start: 2, settled: "second speaker", pending: "", speaker: "d1"),
            ],
            speakers: [.init(id: "d0", name: "Boris", state: "confirmed"), .init(id: "d1", name: "Cleo", state: "diarized")]
        )
        let heard = [TranscriptSegment(id: 9, start: 0.5, end: 2, words: [
            .init("new", start: 0.5, end: 1), .init("microphone", start: 1, end: 2),
        ], settledCount: 1)]
        let replacement = Transcript.microphoneReplacement(
            in: state, far: attributed ? far : nil, names: names.snapshot(), heard: heard
        )
        let expected: [TranscriptFormat.Segment] = [
            .init(side: .theirs, start: 0, settled: attributed ? "attributed far" : "raw far", pending: "",
                  filledInLater: true, speaker: attributed ? "d0" : "z1"),
            .init(side: .mine, start: 0.5, settled: "new", pending: "microphone"),
        ] + (attributed ? [far.far[1]] : [])
        #expect(replacement.segments == expected)
        #expect(replacement.speakers == (attributed ? far.speakers : [.init(id: "z1", name: "Anna", state: "tentative")]))
        try await writer.replaceWhole(replacement.segments, speakers: replacement.speakers)
        #expect(bytes.calls() == ["replace"])
        let text = try #require(bytes.replaced())
        #expect(text.contains("**\(attributed ? "Them 1" : "Them")** 00:00:00 (filled in later)\n\(attributed ? "attributed far" : "raw far")\n"))
        #expect(text.contains("**Me** 00:00:00\nnew microphone\n"))
        #expect(text.contains(attributed ? "- Them 1: Boris\n- Them 2: Cleo\n" : "- Them: Anna\n"))
        #expect(!text.contains("old microphone"))
        #expect(!text.contains("Another call"))
    }

    @Test func aWriteThatFailsToRenderMakesTheNextWriteReplaceTheFileWhole() async throws {

        let bytes = BytesSpy()
        let renderer = RendererStub()
        let writer = WritingTranscript(file: bytes, format: renderer, names: LiveNameBoard(), sink: RenderingLog())
        let state = CallState(status: .listening, entries: [
            .init(speaker: .mine, text: .init(id: 0, start: 1, end: 2, words: [.init("1", start: 1, end: 2), .init("final", start: 1, end: 2)], settledCount: 2), writtenLater: false),
        ], finalCount: 1)
        try await writer.write(state)
        renderer.failNext()
        await #expect(throws: TranscriptFormat.Failure.invalidStart) { try await writer.write(state) }
        try await writer.write(state)
        try await writer.write(state)
        #expect(bytes.calls() == ["write", "replace", "write"])
    }

    @Test func closingAfterAFailedRenderingEndsFurtherWrites() async throws {

        try await withComposeFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let binding = RecordingTranscriptBinding()
            var initial = TranscriptFormat()
            let file = try await TranscriptFile(url: url, initialBytes: try initial.render([]).chunks, binding: binding)
            let writer = WritingTranscript(file: file, format: TranscriptFormat(), names: LiveNameBoard(), sink: RenderingLog())
            let bad = CallState(status: .listening, entries: [
                .init(speaker: .mine, text: .init(id: 1, start: .nan, end: 3, words: [.init("bad", start: .nan, end: 3)], settledCount: 1), writtenLater: false),
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
                .init(speaker: .theirs, text: .init(id: 1, start: 2, end: 3, words: [.init("1", start: 2, end: 3), .init("hello", start: 2, end: 3)], settledCount: 2), writtenLater: false),
            ], finalCount: 1)
            for revision in 1...2 {
                _ = binding.take()
                try await writer.write(snapshot)
                #expect(binding.take() == ["create", "rename"])
                let text = try String(contentsOf: url, encoding: .utf8)
                #expect(text.contains("**Them** 00:00:02\n1 hello\n"))
                #expect(text.contains("- Them: Anna\n"))
                #expect(text.contains("\"revision\":\(revision)"))
            }
            await writer.close()
        }
    }
}

/// The real format, failing once when asked to.
private final class RendererStub: TranscriptRenderer {

    private let state = Mutex((format: TranscriptFormat(), fail: false))

    func failNext() { state.withLock { $0.fail = true } }

    func render(count: Int, finalCount: Int, speakers: [TranscriptFormat.Speaker], segment: (Int) -> TranscriptFormat.Segment) throws -> TranscriptFormat.Rendering {

        try state.withLock { value in
            if value.fail { value.fail = false; throw TranscriptFormat.Failure.invalidStart }
            return try value.format.render(count: count, finalCount: finalCount, speakers: speakers, segment: segment)
        }
    }

    func renderWhole(_ segments: [TranscriptFormat.Segment], speakers: [TranscriptFormat.Speaker]) throws -> TranscriptFormat.Rendering {

        try TranscriptFormat().renderWhole(segments, speakers: speakers)
    }
}

private final class BytesSpy: TranscriptBytes {

    private let log = Mutex<[String]>([])
    private let replacement = Mutex<String?>(nil)

    func calls() -> [String] { log.withLock { $0 } }
    func replaced() -> String? { replacement.withLock { $0 } }
    func write(_ chunks: [Data], finalLength: Int?) async throws { log.withLock { $0.append("write") } }
    func replace(_ chunks: [Data], finalLength: Int?) async throws {
        log.withLock { $0.append("replace") }
        replacement.withLock { $0 = String(decoding: chunks.reduce(Data(), +), as: UTF8.self) }
    }
    func close() async { log.withLock { $0.append("close") } }
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
