import Testing
@testable import LiveText

struct FinalSegmentsTests {

    @Test(arguments: ["pause", "sentence", "maximum"], [false, true])
    func finalSegmentsKeepTheirTextAndEnd(cut: String, failing: Bool) {

        let words: [Word] = cut == "pause"
            ? (0..<6).map { Word("word\($0).", start: Double($0 * 3), end: Double($0 * 3) + 0.5) }
            : (0..<65).map { Word("word\($0)" + (cut == "sentence" && $0 % 16 == 15 ? "." : ""), start: Double($0), end: Double($0) + 1) }
        var segments = Segments(pause: 2)
        segments.hear(Hearing(words: words, finalThrough: words[words.count - 3].end))
        var count = segments.finalCount
        #expect(count > 0)
        var final = Array(segments.all.prefix(count))
        var ends = Array(segments.all.dropFirst().prefix(count).map(\.start))
        for hearing in [
            Hearing(words: [Word("replacement", start: 0, end: 1), Word("new tail", start: words.last!.start, end: words.last!.end)], from: 0),
            Hearing(words: [], finalThrough: words[words.count - 2].end),
        ] {
            segments.hear(hearing)
            #expect(segments.finalCount >= count)
            #expect(Array(segments.all.prefix(count)) == final)
            #expect(Array(segments.all.dropFirst().prefix(count).map(\.start)) == ends)
            count = segments.finalCount
            final = Array(segments.all.prefix(count))
            ends = Array(segments.all.dropFirst().prefix(count).map(\.start))
        }
        if failing { segments.fail() } else { segments.finish(Hearing(words: [])) }
        #expect(Array(segments.all.prefix(count)) == final)
        #expect(Array(segments.all.dropFirst().prefix(count).map(\.start)) == ends)
        #expect(segments.finalCount == segments.all.count)
        #expect(segments.all.allSatisfy { $0.pending.isEmpty })
        #expect(segments.ending == (failing ? .failed : .finished))
    }

    @Test(arguments: [false, true])
    func deltasIncludeNewlyFinalSegmentsUntilTheNextUpdate(failing: Bool) async {

        let a = Word("one.", start: 0, end: 0.5)
        let b = Word("two.", start: 3, end: 3.5)
        let c = Word("draft", start: 6, end: 6.5)
        let revision = Word("three", start: 7, end: 7.5)
        let hearings = [
            Hearing(words: [a, b]),
            Hearing(words: [], finalThrough: a.end),
            Hearing(words: [c], finalThrough: b.end),
            Hearing(words: [revision], from: c.start, finalThrough: revision.end),
        ]
        let live = LiveText(recognizer: DeltaRecognizer(hearings: hearings, finishFails: failing))
        let source = DeltaAudio()
        for _ in hearings { source.chunks.continuation.yield(.init(samples: [0], sampleRate: 1)) }
        source.chunks.continuation.finish()
        await live.listen(to: source)
        var updates: [LiveText.Update] = []
        for await update in live.updates { updates.append(update) }
        #expect(updates.map(\.from) == [0, 0, 0, 1, 2])
        #expect(updates.map(\.finalCount) == [0, 0, 1, 2, 3])
        #expect(updates.map { $0.segments.map(\.id) } == [[0, 1], [0, 1], [0, 1, 2], [1, 2], [2]])
        #expect(updates[3].segments == [
            .init(id: 1, start: 3, settled: "two.", pending: ""),
            .init(id: 2, start: 7, settled: "three", pending: ""),
        ])
        #expect(updates.last?.end == revision.end)
        #expect(updates.last?.ending == (failing ? .failed : .finished))
    }

    @Test(arguments: [20, 800, 6_000])
    func liveTextEmitsOnlyTheTailAfterFinalHistory(count: Int) async throws {

        let words = (0...count).map { Word("word\($0).", start: Double($0 * 3), end: Double($0 * 3) + 0.5) }
        let hearings = [
            Hearing(words: words, finalThrough: words.last!.end),
            Hearing(words: [Word("draft", start: Double(count * 3) + 0.5, end: Double(count * 3) + 1)]),
            Hearing(words: [Word("revision", start: Double(count * 3) + 0.5, end: Double(count * 3) + 1)]),
        ]
        let live = LiveText(recognizer: DeltaRecognizer(hearings: hearings))
        let source = DeltaAudio()
        let listening = Task { await live.listen(to: source) }
        defer { source.chunks.continuation.finish(); listening.cancel() }
        var updates = live.updates.makeAsyncIterator()
        var finalCount = 0
        var all: [Segments.Segment] = []
        for index in hearings.indices {
            source.chunks.continuation.yield(.init(samples: [0], sampleRate: 1))
            let update = try #require(await updates.next())
            #expect(update.from == finalCount)
            #expect(update.finalCount == count)
            #expect(update.segments.count == (index == 0 ? count + 1 : 1))
            all.replaceSubrange(update.from..., with: update.segments)
            finalCount = update.finalCount
        }
        #expect(all.count == count + 1)
        #expect(all.last?.pending == "revision")
        source.chunks.continuation.finish()
        let finished = try #require(await updates.next())
        #expect(finished.from == count)
        #expect(finished.finalCount == count + 1)
        #expect(finished.segments.count == 1)
        #expect(finished.segments[0].settled == "word\(count). revision")
        #expect(finished.ending == .finished)
        await listening.value
    }
}

private actor DeltaRecognizer: Recognizer {

    var hearings: [Hearing]
    let finishFails: Bool
    init(hearings: [Hearing], finishFails: Bool = false) {
        self.hearings = hearings
        self.finishFails = finishFails
    }
    func hear(_ chunk: AudioChunk) -> Hearing { hearings.removeFirst() }
    struct Failed: Error {}
    func finish() throws -> Hearing {
        if finishFails { throw Failed() }
        return Hearing(words: [])
    }
}

private struct DeltaAudio: AudioSource {

    let chunks = AsyncStream<AudioChunk>.makeStream()
    func audio() -> AsyncStream<AudioChunk> { chunks.stream }
}
