import Testing
import LiveText
import struct SideText.Audio
import struct SideText.Text
@testable import Compose

@Suite(.timeLimit(.minutes(1)))
struct TrackTextDeltaTests {

    @Test(arguments: [20, 800, 6_000])
    func keepsTextAcrossCancellationReplayAndFinish(count: Int) async throws {

        let words = (0...count).map { Word("word\($0).", start: Double($0 * 3), end: Double($0 * 3) + 0.5) }
        let start = Double(count * 3)
        let began = Signal(), release = Signal()
        let recognizer = ScriptRecognizer(hearings: [
            .success(Hearing(words: words, finalThrough: words.last!.end)),
            .success(Hearing(words: [Word("draft", start: start + 0.5, end: start + 1)])),
            .success(Hearing(words: [Word("next.", start: start + 4, end: start + 4.5)], finalThrough: start + 4.5)),
        ], endings: [.success(Hearing(words: [Word("last", start: start + 4.5, end: start + 5)]))], blocked: began, release: release)
        let adapter = TrackText(recognizerSource: { recognizer })
        defer { release.end(); began.end() }
        try await adapter.prepare()
        let firstAudio = Audio(start: 0, samples: [0], sampleRate: 1)
        let cancelled = Task { try await adapter.hear(firstAudio) }
        await began.next()
        cancelled.cancel()
        await #expect(throws: CancellationError.self) { try await cancelled.value }
        release.send()
        let replay = try await adapter.hear(firstAudio)
        #expect(replay.final.map(\.id) == Array(0..<count))
        #expect(replay.tail == [Text(id: count, start: start, end: start + 0.5, settled: "word\(count).")])
        #expect(try await adapter.hear(firstAudio) == replay)

        let changing = Task { try await adapter.hear(Audio(start: 1, samples: [1], sampleRate: 1)) }
        await began.next()
        release.send()
        let changed = try await changing.value
        #expect(changed.final == replay.final)
        #expect(changed.tail == [Text(id: count, start: start, end: start + 1, settled: "word\(count).", pending: "draft")])

        let advancing = Task { try await adapter.hear(Audio(start: 2, samples: [2], sampleRate: 1)) }
        await began.next()
        release.send()
        let advanced = try await advancing.value
        #expect(advanced.final.count == count + 1)
        #expect(advanced.final.last == Text(id: count, start: start, end: start + 4, settled: "word\(count). draft"))
        #expect(advanced.tail == [Text(id: count + 1, start: start + 4, end: start + 4.5, settled: "next.")])

        let finished = try await adapter.finish()
        #expect(finished.final == advanced.final + [Text(id: count + 1, start: start + 4, end: start + 5, settled: "next. last")])
        #expect(finished.tail.isEmpty)
        #expect(await recognizer.chunks.count == 3)
        #expect(await recognizer.finishes == 1)
    }
}
