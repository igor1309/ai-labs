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

    @Test func switchingTextBackOnKeepsSettledWordsFromBeforeTheCancelledHearing() async throws {

        let began = Signal()
        let release = Signal()
        let recognizer = ScriptRecognizer(hearings: [
            .success(.init(words: [.init("earlier", start: 0, end: 1)], finalThrough: 1)),
            .success(.init(words: [.init("later", start: 1, end: 2)], from: 1)),
            .success(.init(words: [.init("revised", start: 1, end: 2)], from: 1)),
        ], endings: [.success(.init(words: []))], blocked: began, release: release)
        let microphone = TextAudio()
        let other = TextAudio()
        defer { microphone.end(); other.end(); release.end() }
        let call = CallText(
            microphone: Track(
                audio: microphone,
                written: TextTrack(chunks: [.init(start: 1, samples: [0.5], sampleRate: 1)]),
                text: Compose.TrackText(recognizer: recognizer)
            ),
            call: Track(audio: other, written: TextTrack(chunks: []), text: Compose.TrackText(recognizer: ScriptRecognizer(
                hearings: [], endings: [.success(.init(words: []))]
            )))
        )
        await call.start()
        var states = call.updates.makeAsyncIterator()
        while let state = await states.next(), state.status != .listening {}
        release.send()
        await microphone.send(.init(start: 0, samples: [0.25], sampleRate: 1))
        await began.next()
        let before = await call.state
        #expect(before.entries.map(\.text) == [.init(id: 0, start: 0, end: 1, settled: "earlier")])
        let hearing = Task { await microphone.send(.init(start: 1, samples: [0.5], sampleRate: 1)) }
        defer { hearing.cancel() }
        await began.next()
        await call.setEnabled(false)
        await hearing.value
        #expect(await call.state.entries == before.entries)
        await call.setEnabled(true)
        release.end()
        while let state = await states.next() {
            if state.status == .listening || state.status == .finished { break }
        }
        let resumed = await call.state
        #expect(resumed.status == .listening)
        #expect(resumed.entries.map(\.text) == [
            .init(id: 0, start: 0, end: 2, settled: "earlier", pending: "revised"),
        ])
        await call.stop()
    }

    @Test func releasingAPreparedAdapterCompletesItsListeningWork() async throws {

        let released = Signal()
        let finishes = Values<Bool>()
        weak var remaining: LifetimeRecognizer?
        do {
            let recognizer = LifetimeRecognizer(released: released, finishes: finishes)
            remaining = recognizer
            let adapter = Compose.TrackText(recognizer: recognizer)
            try await adapter.prepare()
        }
        await released.next()
        #expect(remaining == nil)
        #expect(finishes.all == [true])
    }

    @Test func cancellingHearingEndsOnlyTheWait() async throws {

        let began = Signal()
        let release = Signal()
        let recognizer = ScriptRecognizer(
            hearings: [.success(.init(words: []))], endings: [.success(.init(words: []))], blocked: began, release: release
        )
        let adapter = Compose.TrackText(recognizer: recognizer)
        try await adapter.prepare()
        let hearing = Task { try await adapter.hear(.init(start: 0, samples: [0.25], sampleRate: 1)) }
        defer { hearing.cancel(); release.end() }
        await began.next()
        hearing.cancel()
        await #expect(throws: CancellationError.self) { try await hearing.value }
        #expect(await recognizer.chunks == [.init(samples: [0.25], sampleRate: 1)])
        #expect(await recognizer.finishes == 0)
        release.end()
        #expect(try await adapter.finish() == [])
        #expect(await recognizer.finishes == 1)
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
