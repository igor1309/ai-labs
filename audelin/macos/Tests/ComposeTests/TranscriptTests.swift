import Compose
import Foundation
import Testing
import TranscriptFile
@testable import CallText

@Suite(.timeLimit(.minutes(1)))
struct TranscriptTests {

    @Test func entryMappingTable() {

        let entries: [State.Entry] = [
            .init(speaker: .theirs, text: .init(id: 9, start: 8.25, end: 10, pending: "them"), writtenLater: false),
            .init(speaker: .mine, text: .init(id: 4, start: 1.5, end: 3, settled: "me", pending: "next"), writtenLater: true),
            .init(speaker: .theirs, text: .init(id: 2, start: 4, end: 5, settled: "да"), writtenLater: true),
            .init(speaker: .mine, text: .init(id: 8, start: 0, end: 1), writtenLater: false),
        ]
        let mapped: [TranscriptFile.Segment] = [
            .init(side: .theirs, start: 8.25, settled: "", pending: "them", filledInLater: false),
            .init(side: .mine, start: 1.5, settled: "me", pending: "next", filledInLater: true),
            .init(side: .theirs, start: 4, settled: "да", pending: "", filledInLater: true),
            .init(side: .mine, start: 0, settled: "", pending: "", filledInLater: false),
        ]
        for status: State.Status in [.off, .gettingReady, .listening, .failed("failed"), .finished] {
            #expect(Transcript.segments(from: State(status: status, entries: [])) == [])
            #expect(Transcript.segments(from: State(status: status, entries: entries)) == mapped)
            for (entry, segment) in zip(entries, mapped) {
                #expect(Transcript.segments(from: State(status: status, entries: [entry])) == [segment])
            }
        }
    }

    @Test func feedWritesEverySnapshot() async throws {

        try await withComposeFolder { folder in
            let url = folder.appendingPathComponent("transcript.md")
            let file = try TranscriptFile(url: url)
            let snapshots = [
                (State(status: .listening, entries: [
                    .init(speaker: .mine, text: .init(id: 0, start: 2, end: 3, pending: "first"), writtenLater: false),
                ]), "# Transcript\n\n**Me** 00:00:02\nfirst\n"),
                (State(status: .finished, entries: [
                    .init(speaker: .theirs, text: .init(id: 1, start: 4, end: 6, settled: "final", pending: "words"), writtenLater: true),
                ]), "# Transcript\n\n**Them** 00:00:04 (filled in later)\nfinal words\n"),
                (State(status: .off, entries: []), "# Transcript\n\nNo text was heard.\n"),
            ]
            for (state, expected) in snapshots {
                let source = AsyncStream<State>.makeStream()
                source.continuation.yield(state)
                source.continuation.finish()
                try await Transcript.feed(source.stream, to: file)
                #expect(try String(contentsOf: url, encoding: .utf8) == expected)
            }
            let source = AsyncStream<State>.makeStream()
            for (state, _) in snapshots { source.continuation.yield(state) }
            source.continuation.finish()
            try await Transcript.feed(source.stream, to: file)
            #expect(try String(contentsOf: url, encoding: .utf8) == snapshots.last?.1)
            await file.close()
        }
    }

    @Test func feedSurfacesWriteFailures() async throws {

        try await withComposeFolder { folder in
            let file = try TranscriptFile(url: folder.appendingPathComponent("transcript.md"))
            await file.close()
            let source = AsyncStream<State>.makeStream()
            source.continuation.yield(State(status: .off, entries: []))
            source.continuation.finish()
            await #expect(throws: TranscriptFile.Failure.writingEnded) {
                try await Transcript.feed(source.stream, to: file)
            }
        }
    }

    @Test func cancellingFeedEndsAPendingUpdateWait() async throws {

        try await withComposeFolder { folder in
            let file = try TranscriptFile(url: folder.appendingPathComponent("transcript.md"))
            let source = AsyncStream<State>.makeStream()
            defer { source.continuation.finish() }
            let task = Task { try await Transcript.feed(source.stream, to: file) }
            task.cancel()
            await #expect(throws: CancellationError.self) { try await task.value }
            await file.close()
        }
    }
}
