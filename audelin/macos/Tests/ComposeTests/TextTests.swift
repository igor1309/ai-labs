import Compose
import Testing
@testable import CallText
@testable import LiveText

@Suite(.timeLimit(.minutes(1)))
struct TextTests {

    @Test func segmentMappingTable() {

        let first = Segments.Segment(id: 7, start: 1.25, settled: "one", pending: "two")
        let second = Segments.Segment(id: 3, start: 6.5, settled: "", pending: "три")
        let last = Segments.Segment(id: 9, start: 10, settled: "four", pending: "")
        let cases: [([Segments.Segment], Double, [Text])] = [
            ([], 0, []),
            ([first], 4, [.init(id: 7, start: 1.25, end: 4, settled: "one", pending: "two")]),
            ([first, second, last], 12, [
                .init(id: 7, start: 1.25, end: 6.5, settled: "one", pending: "two"),
                .init(id: 3, start: 6.5, end: 10, pending: "три"),
                .init(id: 9, start: 10, end: 12, settled: "four"),
            ]),
        ]
        for (segments, end, expected) in cases {
            #expect(Compose.TrackText.text(from: segments, through: end) == expected)
        }
    }

    @Test func hearsOneUpdatePerChunkAndFinishesWithTheLastRevision() async throws {

        let recognizer = ScriptRecognizer(hearings: [
            .success(.init(words: [.init("one", start: 0.5, end: 1)])),
            .success(.init(words: [.init("two", start: 3.5, end: 4)], finalThrough: 1)),
        ], endings: [.success(.init(words: [.init("last", start: 3.5, end: 4)]))])
        let adapter = Compose.TrackText(recognizer: recognizer)
        try await adapter.prepare()
        try await adapter.prepare()
        #expect(try await adapter.hear(.init(start: 0, samples: [0.25, 0.5], sampleRate: 1)) == [
            .init(id: 0, start: 0.5, end: 2, pending: "one"),
        ])
        try await adapter.prepare()
        #expect(try await adapter.hear(.init(start: 2, samples: [0.125, -0.5, 0.5, 0.25], sampleRate: 2)) == [
            .init(id: 0, start: 0.5, end: 3.5, settled: "one"),
            .init(id: 1, start: 3.5, end: 4, pending: "two"),
        ])
        #expect(try await adapter.finish() == [
            .init(id: 0, start: 0.5, end: 3.5, settled: "one"),
            .init(id: 1, start: 3.5, end: 4, settled: "last"),
        ])
        #expect(await recognizer.chunks == [
            AudioChunk(samples: [0.25, 0.5], sampleRate: 1),
            AudioChunk(samples: [0.125, -0.5, 0.5, 0.25], sampleRate: 2),
        ])
        #expect(await recognizer.finishes == 1)
    }

    @Test func prepareAfterFinishKeepsNoPreviousSegments() async throws {

        let recognizer = ScriptRecognizer(hearings: [
            .success(.init(words: [.init("old", start: 0, end: 1)])),
            .success(.init(words: [.init("new", start: 1, end: 2)])),
        ], endings: [.success(.init(words: [])), .success(.init(words: []))])
        let adapter = Compose.TrackText(recognizer: recognizer)
        try await adapter.prepare()
        _ = try await adapter.hear(.init(start: 0, samples: [0.25], sampleRate: 1))
        #expect(try await adapter.finish() == [.init(id: 0, start: 0, end: 1, settled: "old")])
        try await adapter.prepare()
        #expect(try await adapter.hear(.init(start: 1, samples: [0.5], sampleRate: 1)) == [
            .init(id: 0, start: 1, end: 2, pending: "new"),
        ])
        #expect(try await adapter.finish() == [.init(id: 0, start: 1, end: 2, settled: "new")])
        #expect(await recognizer.finishes == 2)
    }

    @Test(arguments: [false, true])
    func failedUpdatesThrow(atFinish: Bool) async throws {

        let recognizer = ScriptRecognizer(
            hearings: [atFinish ? .success(.init(words: [])) : .failure(.failed)],
            endings: atFinish ? [.failure(.failed)] : []
        )
        let adapter = Compose.TrackText(recognizer: recognizer)
        try await adapter.prepare()
        let audio = Audio(start: 0, samples: [0.25], sampleRate: 1)
        if atFinish {
            _ = try await adapter.hear(audio)
            await #expect(throws: Compose.TrackText.Failure.updateFailed) { try await adapter.finish() }
        } else {
            await #expect(throws: Compose.TrackText.Failure.updateFailed) { try await adapter.hear(audio) }
        }
    }

    @Test func cancellingHearingEndsTheWaitAndListening() async throws {

        let began = Signal()
        let release = Signal()
        let recognizer = ScriptRecognizer(
            hearings: [], endings: [.success(.init(words: []))], blocked: began, release: release
        )
        let adapter = Compose.TrackText(recognizer: recognizer)
        try await adapter.prepare()
        let hearing = Task { try await adapter.hear(.init(start: 0, samples: [0.25], sampleRate: 1)) }
        defer { hearing.cancel(); release.end() }
        await began.next()
        hearing.cancel()
        await #expect(throws: CancellationError.self) { try await hearing.value }
        #expect(await recognizer.chunks == [.init(samples: [0.25], sampleRate: 1)])
    }

    @Test func cancellingFinishCancelsTheRecognizersLastUpdate() async throws {

        let began = Signal()
        let release = Signal()
        let recognizer = ScriptRecognizer(
            hearings: [], endings: [], finishing: began, finishRelease: release
        )
        let adapter = Compose.TrackText(recognizer: recognizer)
        try await adapter.prepare()
        let finishing = Task { try await adapter.finish() }
        defer { finishing.cancel(); release.end() }
        await began.next()
        finishing.cancel()
        await #expect(throws: CancellationError.self) { try await finishing.value }
        #expect(await recognizer.finishes == 1)
    }
}
