import BlockingTestWork
import AVFoundation
import Dispatch
import Foundation
import LiveText
import Testing
@testable import NemotronRecognizer

/// One test at a time: a test replaces the process-wide decoder builder.
@Suite(.serialized)
struct NemotronRecognizerTests {

    @Test func modelLoadingStaysOnItsQueueAcrossNonisolatedAsyncCalls() async throws {

        let queue = DispatchQueue(label: "test.NemotronModelLoading")
        let makeDecoder = NemotronRecognizer.sharedDecoders(
            loadQueue: queue,
            load: { await loadModelOnQueue(queue) },
            makeDecoder: { model in
                ScriptedDecoder([[DecodedToken("▁\(model)", start: 0.1, end: 0.4)]])
            }
        )
        let recognizer = NemotronRecognizer(decoder: try await makeDecoder())

        let hearing = try await recognizer.hear(silence(1.12))

        #expect(hearing.words == [Word("42", start: 0.1, end: 0.4)])
    }

    @Test func recognizersBuiltTogetherShareOneModelLoad() async throws {

        let load = ControlledModelLoad()
        let makeDecoder = NemotronRecognizer.sharedDecoders(
            load: { await load.load() },
            makeDecoder: { model in
                ScriptedDecoder([[DecodedToken("▁\(model)", start: 0.1, end: 0.4)]])
            }
        )
        let (building, arrivals) = AsyncStream<Void>.makeStream()
        defer { arrivals.finish() }
        let build: @Sendable () async throws -> NemotronRecognizer = {
            arrivals.yield(())
            return NemotronRecognizer(decoder: try await makeDecoder())
        }
        let recognizers = 4

        let built = try await withThrowingTaskGroup(of: NemotronRecognizer.self) { group in
            for _ in 0..<recognizers {
                group.addTask { try await build() }
            }
            var entries = building.makeAsyncIterator()
            for _ in 0..<recognizers { await entries.next() }
            var starts = load.started.makeAsyncIterator()
            await starts.next()

            await load.finish(42)
            var built: [NemotronRecognizer] = []
            for try await recognizer in group { built.append(recognizer) }
            return built
        }

        #expect(built.count == recognizers)
        #expect(await load.calls == 1)
        for recognizer in built {
            let hearing = try await recognizer.hear(silence(1.12))
            #expect(hearing.words == [Word("42", start: 0.1, end: 0.4)])
        }
    }

    @Test func nothingIsHeardBeforeAChunksAudioIsIn() async throws {

        let decoder = ScriptedDecoder([[token("▁слово", 0.2, 0.5)]], minimumSamples: 17_920)
        let recognizer = NemotronRecognizer(decoder: decoder)

        let first = try await recognizer.hear(silence(0.6))
        let next = try await recognizer.hear(silence(0.5))

        #expect(first == Hearing(words: []))
        #expect(next == Hearing(words: []))
        #expect(await decoder.feeds.map(\.count) == [9_600, 8_000])
    }

    @Test func wordsAreJoinedAtTheirTimesInTheTrack() async throws {

        let decoder = ScriptedDecoder([[
            token("▁При", 0.2, 0.35), token("вет", 0.35, 0.6),
            token("▁мир", 0.8, 1), token("!", 1, 1.1),
        ]])
        let recognizer = NemotronRecognizer(decoder: decoder)

        let hearing = try await recognizer.hear(silence(1.12))

        #expect(hearing.words == [Word("Привет", start: 0.2, end: 0.6), Word("мир!", start: 0.8, end: 1.1)])
        #expect(hearing.from == 0.2)
    }

    @Test func aWordFollowedByAnotherIsFinal() async throws {

        let recognizer = NemotronRecognizer(decoder: ScriptedDecoder([twoWords]))

        let hearing = try await recognizer.hear(silence(1.12))

        #expect(hearing.words.filter { $0.end <= hearing.finalThrough ?? 0 } == [Word("первое", start: 0.1, end: 0.4)])
    }

    @Test func theLastWordHeardIsPending() async throws {

        let recognizer = NemotronRecognizer(decoder: ScriptedDecoder([twoWords]))

        let hearing = try await recognizer.hear(silence(1.12))

        #expect(hearing.words.filter { $0.end > hearing.finalThrough ?? 0 } == [Word("второе", start: 0.5, end: 0.9)])
    }

    @Test func aGrowingWordIsReadInItsPlaceOnce() async throws {

        let first = [token("▁поэ", 0.2, 0.5)]
        let next = first + [token("тому", 0.5, 0.8), token("▁решим", 1, 1.4)]

        let updates = await listen(NemotronRecognizer(decoder: ScriptedDecoder([first, next])), to: [silence(1.12), silence(1.12)])

        #expect(updates[0].all.map(\.pending) == ["поэ"])
        #expect(updates[1].all.map(\.settled) == ["поэтому"])
        #expect(updates[1].all.map(\.pending) == ["решим"])
        #expect(updates.last?.all.map(\.settled) == ["поэтому решим"])
        #expect(updates.last?.ending == .finished)
    }

    @Test func aChunkWithNothingNewChangesNothing() async throws {

        let recognizer = NemotronRecognizer(decoder: ScriptedDecoder([twoWords, twoWords]))
        let updates = await listen(recognizer, to: [silence(1.12), silence(1.12)])

        #expect(updates[0].all.map(\.settled) == ["первое"])
        #expect(updates[0].all.map(\.pending) == ["второе"])
        #expect(updates[1] == updates[0])
        #expect(updates.last?.all.map(\.settled) == ["первое второе"])
    }

    @Test func theLastWordSettlesAfterTwoQuietChunks() async throws {

        let recognizer = NemotronRecognizer(decoder: ScriptedDecoder([twoWords, twoWords, twoWords]))
        let first = try await recognizer.hear(silence(1.12))
        let second = try await recognizer.hear(silence(1.12))
        let third = try await recognizer.hear(silence(1.12))

        #expect(first.words == [Word("первое", start: 0.1, end: 0.4), Word("второе", start: 0.5, end: 0.9)])
        #expect(second.words.isEmpty)
        #expect(third == Hearing(words: [], finalThrough: 0.9))
    }

    @Test func finishingHearsTheRest() async throws {

        let decoder = ScriptedDecoder([], finished: [token("▁остаток", 0.1, 0.4)])
        let recognizer = NemotronRecognizer(decoder: decoder)

        let first = try await recognizer.hear(silence(0.5))
        let hearing = try await recognizer.finish()

        #expect(first == Hearing(words: []))
        #expect(hearing == Hearing(words: [Word("остаток", start: 0.1, end: 0.4)], from: 0.1, finalThrough: 0.4))
        #expect(await decoder.finishCount == 1)
    }

    /// Contract test: FluidAudio's multilingual Nemotron over the system's Russian voice.
    @Test func audioAtAnotherSampleRateIsHeard() async throws {

        let sentence = "Давай сначала соберем всех. Потом решим, кто за что отвечает, и назначим следующую встречу на четверг."
        let samples = try await spoken(sentence)
        let chunks = stride(from: 0, to: samples.count, by: 4_800).map {
            AudioChunk(samples: Array(samples[$0..<min($0 + 4_800, samples.count)]), sampleRate: 48_000)
        }

        let updates = await listen(try await NemotronRecognizer(), to: chunks)

        let heard = updates.last?.all.map(\.settled).joined(separator: " ") ?? ""
        let streaming = updates.dropLast()
        #expect(streaming.contains { $0.all.contains { !$0.settled.isEmpty } })
        #expect(streaming.contains { $0.all.contains { !$0.pending.isEmpty } })
        #expect(updates.last?.ending == .finished)
        #expect(letters(heard) == letters(sentence))
    }

    @Test func aFailingModelFailsTheRecogniser() async throws {

        let recognizer = NemotronRecognizer(decoder: ScriptedDecoder([], failingFeed: true))

        await #expect(throws: ScriptedDecoder.Failed.self) {
            _ = try await recognizer.hear(silence(1.12))
        }
    }

    @Test func anUnchangedSnapshotReportsNoChange() async throws {

        let recognizer = NemotronRecognizer(decoder: ScriptedDecoder([twoWords, twoWords]))

        _ = try await recognizer.hear(silence(1.12))
        let hearing = try await recognizer.hear(silence(1.12))

        #expect(hearing == Hearing(words: []))
    }

    @Test func insertedTokensAreReportedFromTheEarliestNewWord() async throws {

        let first = [token("▁раз", 0.1, 0.3), token("▁три", 1, 1.4)]
        let next = [first[0], token("▁два", 0.5, 0.8), first[1]]
        let recognizer = NemotronRecognizer(decoder: ScriptedDecoder([first, next]))

        _ = try await recognizer.hear(silence(1.12))
        let hearing = try await recognizer.hear(silence(1.12))

        #expect(hearing == Hearing(words: [Word("два", start: 0.5, end: 0.8), Word("три", start: 1, end: 1.4)], from: 0.5, finalThrough: 0.8))
    }

    @Test func overlappingWordsStayPendingUntilTheirTimesCanSettle() async throws {

        let first = [token("▁долгое", 0.1, 3), token("▁пока", 0.5, 0.8)]
        let next = first + [token("▁позже", 1, 1.4)]
        let last = next + [token("▁конец", 3.1, 3.5)]

        let updates = await listen(NemotronRecognizer(decoder: ScriptedDecoder([first, next, last])), to: [silence(1.12), silence(1.12), silence(1.12)])

        #expect(updates[0].all.map(\.settled) == [""])
        #expect(updates[0].all.map(\.pending) == ["долгое пока"])
        #expect(updates[1].all.map(\.settled) == [""])
        #expect(updates[1].all.map(\.pending) == ["долгое пока позже"])
        #expect(updates[2].all.map(\.settled) == ["долгое пока позже"])
        #expect(updates[2].all.map(\.pending) == ["конец"])
        #expect(updates.last?.all.map(\.settled) == ["долгое пока позже конец"])
    }

    @Test func aWordEndingAfterThePendingWordStartsStaysPending() async throws {

        let first = [token("▁ну", 0.2, 0.5), token("▁по", 0.42, 0.5), token("э", 0.5, 0.58)]
        let next = first + [token("тому", 0.58, 0.8), token("▁решим", 1, 1.4)]

        let updates = await listen(NemotronRecognizer(decoder: ScriptedDecoder([first, next])), to: [silence(1.12), silence(1.12)])

        #expect(updates[0].all.map(\.settled) == [""])
        #expect(updates[0].all.map(\.pending) == ["ну поэ"])
        #expect(updates[1].all.map(\.settled) == ["ну поэтому"])
        #expect(updates.last?.all.map(\.settled) == ["ну поэтому решим"])
    }

    @Test func reportsStartAtThePreviouslyPendingWord() async throws {

        let next = twoWords + [token("▁третье", 1, 1.4)]
        let recognizer = NemotronRecognizer(decoder: ScriptedDecoder([twoWords, next]))

        _ = try await recognizer.hear(silence(1.12))
        let hearing = try await recognizer.hear(silence(1.12))

        #expect(hearing == Hearing(words: [Word("второе", start: 0.5, end: 0.9), Word("третье", start: 1, end: 1.4)], from: 0.5, finalThrough: 0.9))
    }

    @Test func feedsCarryTheTracksOwnSamples() async throws {

        let decoder = ScriptedDecoder([])
        let recognizer = NemotronRecognizer(decoder: decoder)
        let chunks: [[Float]] = [[0.1, -0.2], [0.3, 0.4, -0.5]]

        for samples in chunks {
            _ = try await recognizer.hear(.init(samples: samples, sampleRate: 16_000))
        }
        _ = try await recognizer.finish()

        #expect(await decoder.feeds == chunks)
    }

    @Test func convertedAudioIsFlushedWhenFinishingOrChangingRate() async throws {

        for rate in [8_000.0, 48_000.0] {
            let decoder = ScriptedDecoder([])
            let recognizer = NemotronRecognizer(decoder: decoder)
            for _ in 0..<4 {
                _ = try await recognizer.hear(.init(samples: .init(repeating: 0.25, count: Int(rate / 4)), sampleRate: rate))
            }
            _ = try await recognizer.hear(.init(samples: [0.75], sampleRate: 16_000))
            _ = try await recognizer.hear(.init(samples: .init(repeating: -0.25, count: Int(rate)), sampleRate: rate))
            _ = try await recognizer.finish()

            let samples = await decoder.feeds.flatMap { $0 }
            #expect(abs(samples.count - 32_001) <= 2)
            try #require(samples.count > 24_000)
            #expect(samples[16_000] == 0.75)
            #expect(abs(samples[8_000] - 0.25) < 0.01)
            #expect(abs(samples[24_000] + 0.25) < 0.01)
        }
    }

    @Test func aFailingFinishFailsTheRecogniser() async throws {

        let recognizer = NemotronRecognizer(decoder: ScriptedDecoder([], failingFinish: true))

        await #expect(throws: ScriptedDecoder.Failed.self) {
            _ = try await recognizer.finish()
        }
    }

    // MARK: - Helpers

    private var twoWords: [DecodedToken] {

        [token("▁первое", 0.1, 0.4), token("▁второе", 0.5, 0.9)]
    }

    private func token(_ text: String, _ start: Double, _ end: Double) -> DecodedToken {

        DecodedToken(text, start: start, end: end)
    }

    private func silence(_ seconds: Double) -> AudioChunk {

        AudioChunk(samples: .init(repeating: 0, count: Int((seconds * 16_000).rounded())), sampleRate: 16_000)
    }

    private func listen(_ recognizer: NemotronRecognizer, to chunks: [AudioChunk]) async -> [Segments] {

        let live = LiveText(recognizer: recognizer)
        let collecting = Task {
            var updates: [Segments] = []
            for await update in live.updates { updates.append(update) }
            return updates
        }
        await live.listen(to: Chunks(chunks: chunks))
        return await collecting.value
    }

    private func letters(_ text: String) -> [String] {

        text.lowercased().replacingOccurrences(of: "ё", with: "е")
            .split(separator: " ")
            .map { $0.filter(\.isLetter) }
            .filter { !$0.isEmpty }
    }

    private func spoken(_ text: String) async throws -> [Float] {

        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try await offPool { try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true) }
        defer { afterwards { try? FileManager.default.removeItem(at: directory) } }
        let url = directory.appendingPathComponent("spoken.wav")
        let say = Process()
        say.executableURL = URL(fileURLWithPath: "/usr/bin/say")
        say.arguments = ["-v", "Milena", "--file-format=WAVE", "--data-format=LEF32@48000", "-o", url.path, text]
        let exited = AsyncStream<Void>.makeStream()
        say.terminationHandler = { _ in exited.continuation.finish() }
        try await offPool { try say.run() }
        for await _ in exited.stream {}
        try #require(say.terminationStatus == 0)

        let file = try AVAudioFile(forReading: url)
        #expect(file.processingFormat.sampleRate == 48_000)
        let buffer = try #require(AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length)))
        try file.read(into: buffer)
        try #require(buffer.frameLength > 0)
        return Array(UnsafeBufferPointer(start: buffer.floatChannelData![0], count: Int(buffer.frameLength)))
    }
}

private nonisolated func loadModelOnQueue(_ queue: DispatchQueue) async -> Int {

    dispatchPrecondition(condition: .onQueue(queue))
    await Task.yield()
    dispatchPrecondition(condition: .onQueue(queue))
    return 42
}

/// Holds every load until the test finishes it; a load after that returns
/// at once, so a recognizer that loads on its own is counted, not stuck.
private actor ControlledModelLoad {

    let started: AsyncStream<Void>
    private let starts: AsyncStream<Void>.Continuation
    private var model: Int?
    private var waiters: [CheckedContinuation<Int, Never>] = []
    private(set) var calls = 0

    init() {

        (started, starts) = AsyncStream<Void>.makeStream()
    }

    func load() async -> Int {

        calls += 1
        starts.yield(())
        if let model { return model }
        return await withCheckedContinuation { waiters.append($0) }
    }

    func finish(_ model: Int) {

        self.model = model
        for waiter in waiters { waiter.resume(returning: model) }
        waiters.removeAll()
        starts.finish()
    }
}

/// Replies with cumulative snapshots once enough audio has arrived.
private actor ScriptedDecoder: TokenDecoder {

    struct Failed: Error {}

    let chunk = 1.12

    private var script: [[DecodedToken]]
    private var current: [DecodedToken] = []
    private let finished: [DecodedToken]?
    private let minimumSamples: Int
    private let failingFeed: Bool
    private let failingFinish: Bool
    private var sampleCount = 0
    private(set) var feeds: [[Float]] = []
    private(set) var finishCount = 0

    init(_ script: [[DecodedToken]], finished: [DecodedToken]? = nil, minimumSamples: Int = 0, failingFeed: Bool = false, failingFinish: Bool = false) {

        self.script = script
        self.finished = finished
        self.minimumSamples = minimumSamples
        self.failingFeed = failingFeed
        self.failingFinish = failingFinish
    }

    func feed(_ samples: [Float]) throws -> [DecodedToken] {

        feeds.append(samples)
        sampleCount += samples.count
        if failingFeed { throw Failed() }
        if sampleCount >= minimumSamples, !script.isEmpty { current = script.removeFirst() }
        return current
    }

    func finish() throws -> [DecodedToken] {

        finishCount += 1
        if failingFinish { throw Failed() }
        return finished ?? current
    }
}

private struct Chunks: AudioSource {

    let chunks: [AudioChunk]

    func audio() -> AsyncStream<AudioChunk> {

        let (stream, continuation) = AsyncStream<AudioChunk>.makeStream()
        chunks.forEach { continuation.yield($0) }
        continuation.finish()
        return stream
    }
}
