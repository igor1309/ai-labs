import BlockingTestWork
import AVFoundation
import Dispatch
import Foundation
import LiveText
import Testing
@testable import ParakeetRecognizer

/// One test at a time: a test replaces the process-wide reader builder,
/// and concurrent downloads into the same model folder break each other.
@Suite(.serialized)
struct ParakeetRecognizerTests {

    @Test func modelLoadingStaysOnItsQueueAcrossNonisolatedAsyncCalls() async throws {

        let queue = DispatchQueue(label: "test.ParakeetModelLoading")
        let makeReader = ParakeetRecognizer.sharedReaders(
            loadQueue: queue,
            load: { await loadModelOnQueue(queue) },
            makeReader: { model in
                ScriptedReader([[WindowWord(String(model), start: 0.1, end: 0.4)]])
            }
        )
        let recognizer = ParakeetRecognizer(reader: try await makeReader())

        let hearing = try await recognizer.hear(silence(6))

        #expect(hearing.words == [Word("42", start: 0.1, end: 0.4)])
    }

    @Test func recognizersBuiltTogetherShareOneModelLoad() async throws {

        let load = ControlledModelLoad()
        let makeReader = ParakeetRecognizer.sharedReaders(
            load: { await load.load() },
            makeReader: { model in
                ScriptedReader([[WindowWord(String(model), start: 0.1, end: 0.4)]])
            }
        )
        let (building, arrivals) = AsyncStream<Void>.makeStream()
        defer { arrivals.finish() }
        let build: @Sendable () async throws -> ParakeetRecognizer = {
            arrivals.yield(())
            return ParakeetRecognizer(reader: try await makeReader())
        }
        let recognizers = 4

        let built = try await withThrowingTaskGroup(of: ParakeetRecognizer.self) { group in
            for _ in 0..<recognizers {
                group.addTask { try await build() }
            }
            var entries = building.makeAsyncIterator()
            for _ in 0..<recognizers { await entries.next() }
            var starts = load.started.makeAsyncIterator()
            await starts.next()

            await load.finish(42)
            var built: [ParakeetRecognizer] = []
            for try await recognizer in group { built.append(recognizer) }
            return built
        }

        #expect(built.count == recognizers)
        #expect(await load.calls == 1)
        for recognizer in built {
            let hearing = try await recognizer.hear(silence(6))
            #expect(hearing.words == [Word("42", start: 0.1, end: 0.4)])
        }
    }

    @Test func nothingIsHeardBeforeAWindowsAudioIsIn() async throws {

        let reader = ScriptedReader([[word("слово", 4.1, 4.5)]])
        let recognizer = ParakeetRecognizer(reader: reader)

        let hearing = try await recognizer.hear(silence(5.9))

        #expect(hearing.words.isEmpty)
        #expect(await reader.sampleCounts.isEmpty)
    }

    @Test func wordsBeforeTheRightContextAreFinal() async throws {

        let recognizer = ParakeetRecognizer(reader: try await RecordedReader())

        _ = try await recognizer.hear(silence(6))
        let hearing = try await recognizer.hear(silence(4))

        let final = hearing.words.filter { $0.end <= hearing.finalThrough ?? 0 }
        #expect(final.map(\.text) == ["Давай", "сначала", "соберем", "врачи", "по", "этому", "проекту."])
    }

    @Test func wordsInTheRightContextArePending() async throws {

        let recognizer = ParakeetRecognizer(reader: try await RecordedReader())

        let hearing = try await recognizer.hear(silence(6))

        #expect(hearing.words.map(\.text) == ["Давай", "сначала", "соберем", "рач."])
        #expect(hearing.words.allSatisfy { $0.end > hearing.finalThrough ?? 0 })
    }

    @Test func theNextWindowReadsPendingWordsAnew() async throws {

        let recognizer = ParakeetRecognizer(reader: try await RecordedReader())

        let first = try await recognizer.hear(silence(6))
        let next = try await recognizer.hear(silence(4))

        #expect(next.from == first.words.first?.start)
        #expect(next.words.prefix(4).map(\.text) == ["Давай", "сначала", "соберем", "врачи"])
    }

    @Test func reportsAreInTrackTime() async throws {

        let reader = ScriptedReader([
            [word("один", 4.25, 4.5)],
            [word("один", 2.25, 2.5), word("два", 3, 3.5)],
        ])
        let recognizer = ParakeetRecognizer(reader: reader)

        let first = try await recognizer.hear(silence(6))
        let next = try await recognizer.hear(silence(4))

        let one = Word("один", start: 4.25, end: 4.5)
        #expect(first == Hearing(words: [one], from: 4.25, finalThrough: 4))
        #expect(next == Hearing(words: [one, Word("два", start: 5, end: 5.5)], from: 4.25, finalThrough: 8))
    }

    @Test func aPendingWordTheNextWindowDoesNotHearIsGone() async throws {

        let reader = ScriptedReader([[word("слово", 4.2, 4.6)], []])

        let updates = await listen(ParakeetRecognizer(reader: reader), to: [silence(6), silence(4)])

        #expect(updates.first?.all.map(\.pending) == ["слово"])
        #expect(updates.dropFirst().first?.all == [])
    }

    @Test func wordsTwoWindowsReadAreHeardOnce() async throws {

        let reader = try await RecordedReader()
        let audio = stride(from: 0, to: reader.duration, by: 1).map { silence(min(1, reader.duration - $0)) }

        let updates = await listen(ParakeetRecognizer(reader: reader), to: audio)

        let settled = updates.last?.all.flatMap { $0.settled.split(separator: " ").map(String.init) } ?? []
        #expect(await reader.sampleCounts == reader.windowSampleCounts)
        #expect(updates.last?.ending == .finished)
        #expect(settled == reader.chunkWords)
    }

    @Test func aWordNoLaterWindowReadsIsFinal() async throws {

        let reader = ScriptedReader([[word("долгое", 1.5, 9)], [word("потом", 2.2, 2.6)]])
        let recognizer = ParakeetRecognizer(reader: reader)

        _ = try await recognizer.hear(silence(6))
        let hearing = try await recognizer.hear(silence(4))

        let long = try #require(hearing.words.first { $0.text == "долгое" })
        #expect(long.end <= hearing.finalThrough ?? 0)
    }

    @Test func aFinalWordStretchedPastTheNextWindowLeavesItsWordsPending() async throws {

        let reader = ScriptedReader([
            [word("долгое", 1.5, 9)],
            [word("старое", 6.25, 6.5)],
            [word("новое", 2.25, 2.5)],
        ])

        let updates = await listen(ParakeetRecognizer(reader: reader), to: [silence(6), silence(4), silence(4)])

        #expect(updates.dropFirst().first?.all.map(\.pending) == ["долгое старое"])
        #expect(updates.last?.all.map(\.settled) == ["долгое новое"])
    }

    @Test func aPendingWordStartingBeforeAFinalWordEndsKeepsItPending() async throws {

        let reader = ScriptedReader([
            [word("в", 3.7, 3.95), word("полдень", 3.9, 4.3)],
            [word("полдень", 1.9, 2.3)],
        ])

        let updates = await listen(ParakeetRecognizer(reader: reader), to: [silence(6)])

        #expect(updates.last?.all.map(\.settled) == ["в полдень"])
    }

    @Test func finishingHearsTheRest() async throws {

        let reader = ScriptedReader([
            [word("раз", 1, 2)],
            [word("два", 3, 3.5)],
            [word("три", 2.5, 2.9)],
        ])
        let recognizer = ParakeetRecognizer(reader: reader)

        _ = try await recognizer.hear(silence(9))
        let hearing = try await recognizer.finish()

        #expect(hearing.words.map(\.text) == ["два", "три"])
        #expect(hearing.words.allSatisfy { $0.end <= hearing.finalThrough ?? 0 })
        #expect(await reader.sampleCounts == [96_000, 112_000, 48_000])
    }

    @Test func windowsCarryTheTracksAudio() async throws {

        let track = (0..<144_000).map(Float.init)
        let reader = ScriptedReader([])
        let recognizer = ParakeetRecognizer(reader: reader)

        for start in stride(from: 0, to: track.count, by: 7_000) {
            _ = try await recognizer.hear(.init(samples: Array(track[start..<min(start + 7_000, track.count)]), sampleRate: 16_000))
        }
        _ = try await recognizer.finish()

        #expect(await reader.windows == [
            Array(track[0..<96_000]),
            Array(track[32_000..<144_000]),
            Array(track[96_000..<144_000]),
        ])
    }

    @Test func aTrackShorterThanTheModelTakesIsHeard() async throws {

        let recognizer = try await ParakeetRecognizer()

        _ = try await recognizer.hear(silence(0.2))
        let hearing = try await recognizer.finish()

        #expect(hearing.words.isEmpty)
    }

    @Test func audioAtAnotherSampleRateIsCutIntoTheSameWindows() async throws {

        let reader = ScriptedReader([[]])
        let recognizer = ParakeetRecognizer(reader: reader)

        for _ in 0..<14 {
            _ = try await recognizer.hear(.init(samples: .init(repeating: 0, count: 24_000), sampleRate: 48_000))
        }

        #expect(await reader.sampleCounts == [96_000])
    }

    @Test func audioAtAnotherSampleRateIsHeard() async throws {

        let sentence = "Давай сначала соберем всех по этому проекту."
        let samples = try await spoken(sentence, sampleRate: 48_000)
        let chunks = stride(from: 0, to: samples.count, by: 4_800).map {
            AudioChunk(samples: Array(samples[$0..<min($0 + 4_800, samples.count)]), sampleRate: 48_000)
        }

        let updates = await listen(try await ParakeetRecognizer(), to: chunks)

        let heard = updates.last?.all.map(\.settled).joined(separator: " ") ?? ""
        #expect(updates.last?.ending == .finished)
        #expect(letters(heard) == letters(sentence))
    }

    @Test func aFailingModelFailsTheRecogniser() async throws {

        let recognizer = ParakeetRecognizer(reader: ScriptedReader([], failing: true))

        await #expect(throws: ScriptedReader.Failed.self) {
            _ = try await recognizer.hear(silence(6))
        }
    }

    @Test func readingStaysOnTheRecognizersQueueAcrossSuspension() async throws {

        let reader = QueueCheckingReader()
        let recognizer = ParakeetRecognizer(reader: reader)
        recognizer.queue.setSpecific(key: recognizerQueue, value: ())

        _ = try await recognizer.hear(silence(6))

        let checks = await reader.onQueue
        #expect(!checks.isEmpty)
        #expect(checks.allSatisfy { $0 })
    }

    // MARK: - Helpers

    private func word(_ text: String, _ start: Double, _ end: Double) -> WindowWord {

        WindowWord(text, start: start, end: end)
    }

    /// The words' letters in lower case, with «ё» read as «е».
    private func letters(_ text: String) -> [String] {

        text.lowercased().replacingOccurrences(of: "ё", with: "е")
            .split(separator: " ")
            .map { $0.filter { $0.isLetter || $0.isNumber } }
            .filter { !$0.isEmpty }
    }

    private func silence(_ seconds: Double) -> AudioChunk {

        AudioChunk(samples: .init(repeating: 0, count: Int((seconds * 16_000).rounded())), sampleRate: 16_000)
    }

    /// Runs the recogniser under Live text over the chunks, and returns every
    /// update Live text published.
    private func listen(_ recognizer: ParakeetRecognizer, to chunks: [AudioChunk]) async -> [SegmentSnapshot] {

        let live = LiveText(recognizer: recognizer)
        let collecting = Task {
            var updates: [SegmentSnapshot] = []
            var all: [Segments.Segment] = []
            for await update in live.updates {
                all.replaceSubrange(update.from..., with: update.segments)
                updates.append((all: all, ending: update.ending))
            }
            return updates
        }
        await live.listen(to: Chunks(chunks: chunks))
        return await collecting.value
    }

    /// The system's Russian voice reading the text, mono at the sample rate.
    private func spoken(_ text: String, sampleRate: Int) async throws -> [Float] {

        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try await offPool { try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true) }
        return try await withCleanup {
            let url = directory.appendingPathComponent("spoken.wav")

            let say = Process()
            say.executableURL = URL(fileURLWithPath: "/usr/bin/say")
            say.arguments = ["-v", "Milena", "--file-format=WAVE", "--data-format=LEF32@\(sampleRate)", "-o", url.path, text]
            try #require(try await exitStatus(of: say) == 0)

            return try await audioFile(url).samples
        } cleanup: {
            try FileManager.default.removeItem(at: directory)
        }
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

/// Replies with the scripted windows in turn, then with none.
private nonisolated(unsafe) let recognizerQueue = DispatchSpecificKey<Void>()

/// Records whether each read runs on the recognizer's queue, before and after it suspends.
private actor QueueCheckingReader: WindowReader {

    private(set) var onQueue: [Bool] = []

    func read(_ samples: [Float]) async throws -> [WindowWord] {

        onQueue.append(DispatchQueue.getSpecific(key: recognizerQueue) != nil)
        await Task.yield()
        onQueue.append(DispatchQueue.getSpecific(key: recognizerQueue) != nil)
        return []
    }
}

private actor ScriptedReader: WindowReader {

    struct Failed: Error {}

    private var script: [[WindowWord]]
    private let failing: Bool
    /// The samples of each window read.
    private(set) var windows: [[Float]] = []

    var sampleCounts: [Int] { windows.map(\.count) }

    init(_ script: [[WindowWord]], failing: Bool = false) {

        self.script = script
        self.failing = failing
    }

    func read(_ samples: [Float]) throws -> [WindowWord] {

        windows.append(samples)
        if failing { throw Failed() }
        return script.isEmpty ? [] : script.removeFirst()
    }
}

/// Replies with the windows Parakeet v3 read from the owner's recording of
/// the terms script, cut 4 s apart with 2 s of audio on each side.
private actor RecordedReader: WindowReader {

    private struct Window: Decodable {

        var start: Double
        var end: Double
        var chunkStart: Double
        var rightContextFrom: Double
        var words: [Spoken]
    }

    private struct Spoken: Decodable {

        var w: String
        var s: Double
        var e: Double

        var middle: Double { (s + e) / 2 }
    }

    private let windows: [Window]
    private var next = 0
    private(set) var sampleCounts: [Int] = []

    /// The recording's length in seconds.
    nonisolated let duration: Double
    nonisolated let windowSampleCounts: [Int]
    /// Each window's words whose middle its chunk holds, in order, with a
    /// word read on both sides of a chunk's edge once. A word in a window's
    /// right context that the next window places just before its chunk is
    /// counted too.
    nonisolated let chunkWords: [String]

    init() async throws {

        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("../../../docs/research/spike/fixtures/terms-shift-0.jsonl")
            .standardizedFileURL
        let windows = try await offPool { try String(contentsOf: url, encoding: .utf8) }
            .split(separator: "\n")
            .map { try JSONDecoder().decode(Window.self, from: Data($0.utf8)) }
        self.windows = windows
        duration = windows.last?.end ?? 0
        windowSampleCounts = windows.map { Int($0.end * 16_000) - Int($0.start * 16_000) }

        var words: [String] = []
        for (index, window) in windows.enumerated() {
            let last = index == windows.count - 1
            for spoken in window.words where spoken.middle >= window.chunkStart
                && (last || spoken.middle < window.rightContextFrom) {
                if let previous = words.last, Self.letters(previous) == Self.letters(spoken.w) { continue }
                words.append(spoken.w)
            }
            guard !last else { continue }
            let following = windows[index + 1]
            for spoken in window.words where spoken.middle >= window.rightContextFrom
                && following.words.contains(where: { read in
                    read.middle < following.chunkStart && Self.letters(read.w) == Self.letters(spoken.w)
                        && min(read.e, spoken.e) > max(read.s, spoken.s)
                }) {
                words.append(spoken.w)
            }
        }
        chunkWords = words
    }

    func read(_ samples: [Float]) -> [WindowWord] {

        sampleCounts.append(samples.count)
        guard next < windows.count else { return [] }
        let window = windows[next]
        next += 1
        return window.words.map { WindowWord($0.w, start: $0.s - window.start, end: $0.e - window.start) }
    }

    private static func letters(_ text: String) -> String {

        text.lowercased().filter { $0.isLetter || $0.isNumber }
    }
}

/// The given chunks, then the end of the audio.
private struct Chunks: AudioSource {

    let chunks: [AudioChunk]

    func audio() -> AsyncStream<AudioChunk> {

        let (stream, continuation) = AsyncStream<AudioChunk>.makeStream()
        chunks.forEach { continuation.yield($0) }
        continuation.finish()
        return stream
    }
}

private typealias SegmentSnapshot = (all: [Segments.Segment], ending: Segments.Ending?)
