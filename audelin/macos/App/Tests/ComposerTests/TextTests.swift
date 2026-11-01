@testable import Composer
import struct SideText.Audio
import struct SideText.Text
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
            #expect(Composer.TrackText.text(from: segments, through: end) == expected)
        }
    }

    @Test func hearsOneUpdatePerChunkAndFinishesWithTheLastRevision() async throws {

        let recognizer = ScriptRecognizer(hearings: [
            .success(.init(words: [.init("one.", start: 0.5, end: 1)])),
            .success(.init(words: [.init("two", start: 3.5, end: 4)], finalThrough: 1)),
        ], endings: [.success(.init(words: [.init("last", start: 3.5, end: 4)]))])
        let adapter = Composer.TrackText(recognizerSource: { recognizer })
        try await adapter.prepare()
        try await adapter.prepare()
        #expect(try await adapter.hear(.init(start: 0, samples: [0.25, 0.5], sampleRate: 1)).all == [
            .init(id: 0, start: 0.5, end: 1, pending: "one."),
        ])
        try await adapter.prepare()
        #expect(try await adapter.hear(.init(start: 2, samples: [0.125, -0.5, 0.5, 0.25], sampleRate: 2)).all == [
            .init(id: 0, start: 0.5, end: 3.5, settled: "one."),
            .init(id: 1, start: 3.5, end: 4, pending: "two"),
        ])
        #expect(try await adapter.finish().all == [
            .init(id: 0, start: 0.5, end: 3.5, settled: "one."),
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
        let adapter = Composer.TrackText(recognizerSource: { recognizer })
        try await adapter.prepare()
        _ = try await adapter.hear(.init(start: 0, samples: [0.25], sampleRate: 1))
        #expect(try await adapter.finish().all == [.init(id: 0, start: 0, end: 1, settled: "old")])
        try await adapter.prepare()
        #expect(try await adapter.hear(.init(start: 1, samples: [0.5], sampleRate: 1)).all == [
            .init(id: 0, start: 1, end: 2, pending: "new"),
        ])
        #expect(try await adapter.finish().all == [.init(id: 0, start: 1, end: 2, settled: "new")])
        #expect(await recognizer.finishes == 2)
    }

    @Test(arguments: [false, true])
    func failedUpdatesThrow(atFinish: Bool) async throws {

        let recognizer = ScriptRecognizer(
            hearings: [atFinish ? .success(.init(words: [])) : .failure(.failed)],
            endings: atFinish ? [.failure(.failed)] : []
        )
        let adapter = Composer.TrackText(recognizerSource: { recognizer })
        try await adapter.prepare()
        let audio = Audio(start: 0, samples: [0.25], sampleRate: 1)
        if atFinish {
            _ = try await adapter.hear(audio)
            await #expect(throws: Composer.TrackText.Failure.updateFailed) { try await adapter.finish() }
        } else {
            await #expect(throws: Composer.TrackText.Failure.updateFailed) { try await adapter.hear(audio) }
        }
    }

    @Test func switchingTextBackOnKeepsSettledWordsFromBeforeTheCancelledHearing() async throws {

        let began = Signal()
        let release = Signal()
        let recognizer = ScriptRecognizer(hearings: [
            .success(.init(words: [.init("earlier", start: 0, end: 1)], finalThrough: 1)),
            .success(.init(words: [.init("later", start: 1, end: 2)], from: 1)),
        ], endings: [.success(.init(words: []))], blocked: began, release: release)
        let microphone = TextAudio()
        let other = TextAudio()
        defer { microphone.end(); other.end(); release.end() }
        let call = CallText(
            microphone: CallSide(
                audio: microphone,
                text: Composer.TrackText(recognizerSource: { recognizer }),
                written: TextTrack(chunks: [.init(start: 1, samples: [0.5], sampleRate: 1)]), sampleRate: 1
            ),
            call: CallSide(audio: other, text: Composer.TrackText(recognizerSource: { [silent = ScriptRecognizer(
                hearings: [], endings: [.success(.init(words: []))]
            )] in silent }), written: TextTrack(chunks: []), sampleRate: 1)
        )
        await call.start()
        var states = call.updates.makeAsyncIterator()
        while let state = await states.next(), state.status != .listening {}
        release.send()
        await microphone.send(.init(start: 0, samples: [0.25], sampleRate: 1))
        await began.next()
        while let state = await states.next(), state.entries.isEmpty {}
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
            if state.status == .listening, state.entries.first?.text.pending == "later" { break }
        }
        let resumed = await call.state
        #expect(resumed.status == .listening)
        #expect(resumed.entries.map(\.text) == [
            .init(id: 0, start: 0, end: 2, settled: "earlier", pending: "later"),
        ])
        microphone.end()
        other.end()
        await call.stop()
        #expect(await recognizer.chunks == [
            .init(samples: [0.25], sampleRate: 1),
            .init(samples: [0.5], sampleRate: 1),
        ])
    }

    @Test func releasingAPreparedAdapterCompletesItsListeningWork() async throws {

        let released = Signal()
        let finishes = Values<Bool>()
        weak var remaining: LifetimeRecognizer?
        do {
            let recognizer = LifetimeRecognizer(released: released, finishes: finishes)
            remaining = recognizer
            let adapter = Composer.TrackText(recognizerSource: { recognizer })
            try await adapter.prepare()
        }
        await released.next()
        #expect(remaining == nil)
        #expect(finishes.all == [true])
    }

    @Test func replayAcknowledgesAcceptedAudioAndHearsOnlyTheUnheardSuffix() async throws {

        let original = Audio(start: 3, samples: [0.25, 0.5], sampleRate: 2)
        let suffix = AudioChunk(samples: [-0.25, -0.5], sampleRate: 4)
        let cases: [([Audio], [AudioChunk], Double)] = [
            ([original], [], 4),
            ([.init(start: 3, samples: [0.25, 0.25, 0.5, 0.5, -0.25, -0.5], sampleRate: 4)], [suffix], 4.5),
            ([
                .init(start: 3, samples: [0.25], sampleRate: 2),
                .init(start: 3.5, samples: [0.5], sampleRate: 2),
                .init(start: 4, samples: suffix.samples, sampleRate: suffix.sampleRate),
            ], [suffix], 4.5),
            ([.init(start: 3.5, samples: [0.5, 0.5, -0.25, -0.5], sampleRate: 4)], [suffix], 4.5),
        ]
        for (replay, extraChunks, end) in cases {
            let began = Signal()
            let release = Signal()
            let recognizer = ScriptRecognizer(
                hearings: [.success(.init(words: [.init("accepted", start: 3, end: 4)]))]
                    + extraChunks.map { _ in .success(.init(words: [.init("suffix", start: 4, end: 4.5)], from: 4)) },
                endings: [.success(.init(words: []))], blocked: began, release: release
            )
            let adapter = Composer.TrackText(recognizerSource: { recognizer })
            try await adapter.prepare()
            let hearing = Task { try await adapter.hear(original) }
            defer { hearing.cancel(); release.end() }
            await began.next()
            hearing.cancel()
            await #expect(throws: CancellationError.self) { try await hearing.value }
            // A cancelled retry must leave the same reply available.
            let retry = Task { try await adapter.hear(original) }
            retry.cancel()
            await #expect(throws: CancellationError.self) { try await retry.value }
            release.end()
            try await adapter.prepare()
            var text: [Text] = []
            for audio in replay { text = try await adapter.hear(audio).all }
            #expect(text.last?.end == end)
            #expect(text.first?.pending == (extraChunks.isEmpty ? "accepted" : "accepted suffix"))
            _ = try await adapter.finish()
            #expect(await recognizer.chunks == [.init(samples: original.samples, sampleRate: original.sampleRate)] + extraChunks)
            #expect(await recognizer.finishes == 1)
        }
    }

    @Test func cancellingHearingEndsOnlyTheWait() async throws {

        let began = Signal()
        let release = Signal()
        let recognizer = ScriptRecognizer(
            hearings: [.success(.init(words: [.init("pending", start: 0, end: 1)]))],
            endings: [.success(.init(words: [.init("final", start: 0, end: 1)]))],
            blocked: began, release: release
        )
        let adapter = Composer.TrackText(recognizerSource: { recognizer })
        try await adapter.prepare()
        let hearing = Task { try await adapter.hear(.init(start: 0, samples: [0.25], sampleRate: 1)) }
        defer { hearing.cancel(); release.end() }
        await began.next()
        hearing.cancel()
        await #expect(throws: CancellationError.self) { try await hearing.value }
        #expect(await recognizer.chunks == [.init(samples: [0.25], sampleRate: 1)])
        #expect(await recognizer.finishes == 0)
        release.end()
        #expect(try await adapter.finish().all == [.init(id: 0, start: 0, end: 1, settled: "final")])
        #expect(await recognizer.finishes == 1)
    }

    @Test func cancellingFinishCancelsTheRecognizersLastUpdate() async throws {

        let began = Signal()
        let release = Signal()
        let recognizer = ScriptRecognizer(
            hearings: [], endings: [], finishing: began, finishRelease: release
        )
        let adapter = Composer.TrackText(recognizerSource: { recognizer })
        try await adapter.prepare()
        let finishing = Task { try await adapter.finish() }
        defer { finishing.cancel(); release.end() }
        await began.next()
        finishing.cancel()
        await #expect(throws: CancellationError.self) { try await finishing.value }
        #expect(await recognizer.finishes == 1)
    }

    @Test func replaySurfacesTheCancelledHearingsFailureWithoutRefeeding() async throws {

        let began = Signal()
        let release = Signal()
        let recognizer = ScriptRecognizer(
            hearings: [.failure(.failed)], endings: [.success(.init(words: []))],
            blocked: began, release: release
        )
        let adapter = Composer.TrackText(recognizerSource: { recognizer })
        try await adapter.prepare()
        let audio = Audio(start: 0, samples: [0.25], sampleRate: 1)
        let hearing = Task { try await adapter.hear(audio) }
        defer { hearing.cancel(); release.end() }
        await began.next()
        hearing.cancel()
        await #expect(throws: CancellationError.self) { try await hearing.value }
        release.end()
        await #expect(throws: Composer.TrackText.Failure.updateFailed) { try await adapter.hear(audio) }
        #expect(await recognizer.chunks == [.init(samples: audio.samples, sampleRate: audio.sampleRate)])
    }
}
