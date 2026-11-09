import struct CallText.SideState
import struct FillIn.Audio
import protocol FillIn.WrittenTrack
import struct SideText.Audio
import struct SideText.Text
import Testing
@testable import Composer

@Suite(.timeLimit(.minutes(1)))
struct SideTests {

    @Test(arguments: [0, 2, 3])
    func hearingKeepsFinalTextAndTailSeparate(finalWordCount: Int) async throws {

        let engine = SideEngine(silent: false, failWord: nil, finalWordCount: finalWordCount)
        let hearing = SideHearing(text: engine)
        let settled: [SideText.Text] = [
            .init(id: 0, start: 0, end: 1, settled: "word0"),
            .init(id: 1, start: 1, end: 2, settled: "word1"),
            .init(id: 2, start: 2, end: 3, settled: "word2")
        ]
        let pending: [SideText.Text] = [
            .init(id: 0, start: 0, end: 1, pending: "word0"),
            .init(id: 1, start: 1, end: 2, pending: "word1"),
            .init(id: 2, start: 2, end: 3, pending: "word2")
        ]

        let heard = try await hearing.hear(sideTones(0..<3, sampleRate: 1))
        #expect(heard.final == Array(settled.prefix(finalWordCount)))
        #expect(heard.tail == Array(pending.dropFirst(finalWordCount)))

        let finished = try await hearing.finish()
        #expect(finished.final == settled)
        #expect(finished.tail.isEmpty)
    }

    @Test(arguments: [2, 3])
    func fillingInKeepsFinalTextBeforeLiveHearing(finalWordCount: Int) async {

        let rig = SideRig(sampleRate: 1, finalWordCount: finalWordCount)
        defer { rig.cleanup() }
        rig.audio.capture(sideTones(0..<3, sampleRate: 1))
        await rig.side.start(enabled: true)
        rig.engine.release.end()
        let caughtUp = await rig.next { $0.status == .listening }
        #expect(caughtUp.entries.map(\.text) == [
            .init(id: 0, start: 0, end: 1, settled: "word0"),
            .init(id: 1, start: 1, end: 2, settled: "word1"),
            .init(id: 2, start: 2, end: 3,
                  settled: finalWordCount == 3 ? "word2" : "",
                  pending: finalWordCount == 3 ? "" : "word2")
        ])
        rig.audio.end()
        await rig.side.stop()
        await rig.listener.value
    }

    @Test(arguments: [2, 3])
    func liveHearingKeepsFinalTextBeforeFinishing(finalWordCount: Int) async {

        let rig = SideRig(sampleRate: 1, finalWordCount: finalWordCount)
        defer { rig.cleanup() }
        await rig.side.start(enabled: true)
        rig.engine.release.end()
        _ = await rig.next { $0.status == .listening }
        await rig.audio.send(sideTones(0..<3, sampleRate: 1))
        let live = await rig.next { $0.status == .listening }
        #expect(live.entries.map(\.text) == [
            .init(id: 0, start: 0, end: 1, settled: "word0"),
            .init(id: 1, start: 1, end: 2, settled: "word1"),
            .init(id: 2, start: 2, end: 3,
                  settled: finalWordCount == 3 ? "word2" : "",
                  pending: finalWordCount == 3 ? "" : "word2")
        ])
        rig.audio.end()
        await rig.side.stop()
        await rig.listener.value
    }

    @Test(arguments: [1.0, 3.0, 48_000.0])
    func fillsMissedAudioThenHearsLiveAudioThroughTheSameEngine(sampleRate: Double) async {

        let rig = SideRig(sampleRate: sampleRate)
        defer { rig.cleanup() }
        rig.audio.capture(sideTones(0..<3, sampleRate: sampleRate))
        await rig.side.start(enabled: true)
        await rig.engine.preparing.next()
        #expect(await rig.next { $0.status == .gettingReady } == SideState(status: .gettingReady, entries: []))
        rig.engine.release.end()
        let caughtUp = await rig.next { $0.status == .listening }
        #expect(caughtUp.entries.map(\.text.pending) == ["word0", "word1", "word2"])
        #expect(caughtUp.entries.allSatisfy { !$0.writtenLater })
        // The buffered delivery overlaps the written prefix by two words.
        await rig.audio.send(sideTones(1..<5, sampleRate: sampleRate))
        let live = await rig.next { $0.entries.count == 5 }
        #expect(live.entries.map(\.text.pending) == (0..<5).map { "word\($0)" })
        #expect(live.entries.map(\.text.start) == (0..<5).map { Double($0) / sampleRate })
        #expect(live.entries.map(\.text.end) == (0..<5).map { Double($0) / sampleRate + 1 / sampleRate })
        rig.audio.end()
        await rig.side.stop()
        let final = await rig.next { $0.status == .finished }
        #expect(final.entries.map(\.text.settled) == (0..<5).map { "word\($0)" })
        #expect(final.entries.allSatisfy { $0.text.pending.isEmpty })
        #expect(await rig.engine.samples == (0..<5).map(Float.init))
        #expect(await rig.engine.preparations == 1)
        #expect(await rig.engine.stops == 1)
        #expect(await rig.written.reads == [0..<(3 / sampleRate)])
        await rig.listener.value
    }

    @Test func switchOnMarksOnlyAudioCapturedBeforeTheSwitchWrittenLater() async {

        let rig = SideRig(sampleRate: 1)
        defer { rig.cleanup() }
        await rig.side.start(enabled: false)
        _ = await rig.next { $0.status == .off }
        rig.audio.capture(sideTones(0..<2, sampleRate: 1))
        await rig.side.setEnabled(true)
        await rig.engine.preparing.next()
        rig.audio.capture(sideTones(2..<3, sampleRate: 1))
        rig.engine.release.end()
        let caughtUp = await rig.next { $0.status == .listening }
        #expect(caughtUp.entries.map(\.text.pending) == ["word0", "word1", "word2"])
        #expect(caughtUp.entries.map(\.writtenLater) == [true, true, false])
        await rig.audio.send(sideTones(3..<4, sampleRate: 1))
        let live = await rig.next { $0.entries.count == 4 }
        #expect(live.entries.map(\.writtenLater) == [true, true, false, false])
        #expect(live.entries.map(\.text.pending) == ["word0", "word1", "word2", "word3"])
        rig.audio.end()
        await rig.side.stop()
        await rig.listener.value
    }

    @Test func switchingOffReleasesHeldFillingInBeforeTheNextSwitchOn() async {

        let rig = SideRig(sampleRate: 1)
        defer { rig.cleanup() }
        rig.audio.capture(sideTones(0..<2, sampleRate: 1))
        await rig.side.start(enabled: true)
        await rig.engine.preparing.next()
        _ = await rig.next { $0.status == .gettingReady }
        await rig.side.setEnabled(false)
        #expect(await rig.next { $0.status == .off } == SideState(status: .off, entries: []))
        await rig.audio.send(sideTones(2..<3, sampleRate: 1))
        await rig.side.setEnabled(true)
        await rig.engine.preparing.next()
        rig.engine.release.end()
        let caughtUp = await rig.next { $0.status == .listening }
        #expect(caughtUp.entries.map(\.text.pending) == ["word0", "word1", "word2"])
        #expect(caughtUp.entries.allSatisfy { $0.writtenLater })
        #expect(await rig.engine.preparations == 2)
        #expect(await rig.engine.samples == [0, 1, 2])
        #expect(await rig.written.reads == [0..<3])
        rig.audio.end()
        await rig.side.stop()
        await rig.listener.value
    }

    @Test func fillingInWithoutWordsStillAdvancesTheLiveAudioCursor() async {

        let rig = SideRig(sampleRate: 1, silent: true)
        defer { rig.cleanup() }
        rig.audio.capture(sideTones(0..<3, sampleRate: 1))
        await rig.side.start(enabled: true)
        rig.engine.release.end()
        let caughtUp = await rig.next { $0.status == .listening }
        #expect(caughtUp.entries.isEmpty)
        await rig.audio.send(sideTones(3..<5, sampleRate: 1))
        rig.audio.end()
        await rig.side.stop()
        #expect(await rig.next { $0.status == .finished } == SideState(status: .finished, entries: []))
        #expect(await rig.engine.samples == (0..<5).map(Float.init))
        await rig.listener.value
    }

    @Test func fillingInFailureKeepsItsConsumedPrefixAndReleasesTheEngine() async {

        let rig = SideRig(sampleRate: 1, failWord: 2)
        defer { rig.cleanup() }
        rig.audio.capture(sideTones(0..<3, sampleRate: 1))
        await rig.side.start(enabled: true)
        rig.engine.release.end()
        let failure = await rig.next { if case .failed = $0.status { return true }; return false }
        #expect(failure.status == .failed("word refused"))
        #expect(failure.entries.map(\.text.pending) == ["word0", "word1"])
        #expect(await rig.engine.samples == [0, 1])
        #expect(await rig.engine.stops == 1)
        await rig.listener.value
    }
}

private struct SideRig {

    let audio = TextAudio()
    let written: SideWritten
    let engine: SideEngine
    let side: CallSide
    let snapshots = AsyncStream<SideState>.makeStream()
    let listener: Task<Void, Never>

    init(sampleRate: Double, silent: Bool = false, failWord: Int? = nil, finalWordCount: Int = 0) {

        written = SideWritten(chunks: (0..<3).map {
            FillIn.Audio(start: Double($0) / sampleRate, samples: [Float($0)], sampleRate: sampleRate)
        })
        engine = SideEngine(silent: silent, failWord: failWord, finalWordCount: finalWordCount)
        side = CallSide(audio: audio, text: engine, written: written, sampleRate: sampleRate)
        let side = side, continuation = snapshots.continuation
        listener = Task {
            await side.listen { continuation.yield($0) }
            continuation.finish()
        }
    }

    func next(_ matches: (SideState) -> Bool) async -> SideState {

        for await snapshot in snapshots.stream where matches(snapshot) { return snapshot }
        Issue.record("Side ended before its expected snapshot")
        return SideState(status: .off, entries: [])
    }

    func cleanup() {

        engine.release.end()
        audio.end()
        listener.cancel()
        snapshots.continuation.finish()
    }
}

private actor SideWritten: FillIn.WrittenTrack {

    let chunks: [FillIn.Audio]
    private(set) var reads: [Range<Double>] = []

    init(chunks: [FillIn.Audio]) { self.chunks = chunks }

    func read(from: Double, through: Double) -> [FillIn.Audio] {

        reads.append(from..<through)
        return chunks.filter { $0.end > from && $0.start < through }
    }
}

private actor SideEngine: TextEngine {

    struct Refusal: Error, CustomStringConvertible {
        var description: String { "word refused" }
    }

    nonisolated let preparing = Signal(), release = Signal()
    private let silent: Bool
    private let failWord: Int?
    private let finalWordCount: Int
    private var text: [SideText.Text] = []
    private(set) var samples: [Float] = []
    private(set) var preparations = 0
    private(set) var stops = 0

    init(silent: Bool, failWord: Int?, finalWordCount: Int) {

        self.silent = silent
        self.failWord = failWord
        self.finalWordCount = finalWordCount
    }

    func prepare() async throws {

        preparations += 1
        preparing.send()
        await release.next()
        try Task.checkCancellation()
    }

    func hear(_ audio: SideText.Audio) throws -> TrackText.Update {

        if let failWord, audio.samples.contains(Float(failWord)) { throw Refusal() }
        samples += audio.samples
        if !silent {
            for (offset, sample) in audio.samples.enumerated() {
                let start = audio.start + Double(offset) / audio.sampleRate
                text.append(.init(id: text.count, start: start, end: start + 1 / audio.sampleRate, pending: "word\(Int(sample))"))
            }
        }
        return .init(
            final: text.prefix(finalWordCount).map {
                .init(id: $0.id, start: $0.start, end: $0.end, settled: $0.pending)
            },
            tail: Array(text.dropFirst(finalWordCount))
        )
    }

    func finish() -> TrackText.Update {

        .init(final: text.map { .init(id: $0.id, start: $0.start, end: $0.end, settled: $0.pending) }, tail: [])
    }

    func shutdown() { stops += 1 }
}

private func sideTones(_ words: Range<Int>, sampleRate: Double) -> SideText.Audio {

    .init(start: Double(words.lowerBound) / sampleRate, samples: words.map(Float.init), sampleRate: sampleRate)
}
