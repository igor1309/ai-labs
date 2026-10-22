import AVFoundation
import Foundation
import LiveText
import Testing
@testable import ParakeetRecognizer

struct ParakeetRecognizerTests {

    @Test func nothingIsHeardBeforeAWindowsAudioIsIn() async throws {

        let reader = ScriptedReader([[word("слово", 4.1, 4.5)]])
        let recognizer = ParakeetRecognizer(reader: reader)

        let hearing = try await recognizer.hear(silence(5.9))

        #expect(hearing.words.isEmpty)
        #expect(await reader.sampleCounts.isEmpty)
    }

    @Test func wordsBeforeTheRightContextAreFinal() async throws {

        let recognizer = ParakeetRecognizer(reader: try RecordedReader())

        _ = try await recognizer.hear(silence(6))
        let hearing = try await recognizer.hear(silence(4))

        let final = hearing.words.filter { $0.end <= hearing.finalThrough ?? 0 }
        #expect(final.map(\.text) == ["Давай", "сначала", "соберем", "врачи", "по", "этому", "проекту."])
    }

    @Test func wordsInTheRightContextArePending() async throws {

        let recognizer = ParakeetRecognizer(reader: try RecordedReader())

        let hearing = try await recognizer.hear(silence(6))

        #expect(hearing.words.map(\.text) == ["Давай", "сначала", "соберем", "рач."])
        #expect(hearing.words.allSatisfy { $0.end > hearing.finalThrough ?? 0 })
    }

    @Test func theNextWindowReadsPendingWordsAnew() async throws {

        let recognizer = ParakeetRecognizer(reader: try RecordedReader())

        let first = try await recognizer.hear(silence(6))
        let next = try await recognizer.hear(silence(4))

        #expect(next.from == first.words.first?.start)
        #expect(next.words.prefix(4).map(\.text) == ["Давай", "сначала", "соберем", "врачи"])
    }

    @Test func aPendingWordTheNextWindowDoesNotHearIsGone() async throws {

        let reader = ScriptedReader([[word("слово", 4.2, 4.6)], []])

        let updates = await listen(ParakeetRecognizer(reader: reader), to: [silence(6), silence(4)])

        #expect(updates.first?.all.map(\.pending) == ["слово"])
        #expect(updates.dropFirst().first?.all == [])
    }

    @Test func wordsTwoWindowsReadAreHeardOnce() async throws {

        let reader = try RecordedReader()
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

    @Test func audioAtAnotherSampleRateIsCutIntoTheSameWindows() async throws {

        let reader = ScriptedReader([[]])
        let recognizer = ParakeetRecognizer(reader: reader)

        for _ in 0..<14 {
            _ = try await recognizer.hear(.init(samples: .init(repeating: 0, count: 24_000), sampleRate: 48_000))
        }

        #expect(await reader.sampleCounts == [96_000])
    }

    @Test func audioAtAnotherSampleRateIsHeard() async throws {

        let samples = try spoken("Давай сначала соберем всех по этому проекту.", sampleRate: 48_000)
        let recognizer = try await ParakeetRecognizer()

        for start in stride(from: 0, to: samples.count, by: 4_800) {
            let chunk = Array(samples[start..<min(start + 4_800, samples.count)])
            _ = try await recognizer.hear(.init(samples: chunk, sampleRate: 48_000))
        }
        let hearing = try await recognizer.finish()

        let text = hearing.words.map { $0.text.lowercased() }.joined(separator: " ")
        #expect(text.contains("сначала"))
        #expect(text.contains("проекту"))
    }

    @Test func aFailingModelFailsTheRecogniser() async throws {

        let recognizer = ParakeetRecognizer(reader: ScriptedReader([], failing: true))

        await #expect(throws: ScriptedReader.Failed.self) {
            _ = try await recognizer.hear(silence(6))
        }
    }

    // MARK: - Helpers

    private func word(_ text: String, _ start: Double, _ end: Double) -> Word {

        Word(text, start: start, end: end)
    }

    private func silence(_ seconds: Double) -> AudioChunk {

        AudioChunk(samples: .init(repeating: 0, count: Int((seconds * 16_000).rounded())), sampleRate: 16_000)
    }

    /// Runs the recogniser under Live text over the chunks, and returns every
    /// update Live text published.
    private func listen(_ recognizer: ParakeetRecognizer, to chunks: [AudioChunk]) async -> [Segments] {

        let live = LiveText(recognizer: recognizer)
        let collecting = Task {
            var updates: [Segments] = []
            for await update in live.updates { updates.append(update) }
            return updates
        }
        await live.listen(to: Chunks(chunks: chunks))
        return await collecting.value
    }

    /// The system's Russian voice reading the text, mono at the sample rate.
    private func spoken(_ text: String, sampleRate: Int) throws -> [Float] {

        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("spoken.wav")

        let say = Process()
        say.executableURL = URL(fileURLWithPath: "/usr/bin/say")
        say.arguments = ["-v", "Milena", "--file-format=WAVE", "--data-format=LEF32@\(sampleRate)", "-o", url.path, text]
        try say.run()
        say.waitUntilExit()
        try #require(say.terminationStatus == 0)

        let file = try AVAudioFile(forReading: url)
        let buffer = try #require(AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length)))
        try file.read(into: buffer)
        return Array(UnsafeBufferPointer(start: buffer.floatChannelData![0], count: Int(buffer.frameLength)))
    }
}

/// Replies with the scripted windows in turn, then with none.
private actor ScriptedReader: WindowReader {

    struct Failed: Error {}

    private var windows: [[Word]]
    private let failing: Bool
    private(set) var sampleCounts: [Int] = []

    init(_ windows: [[Word]], failing: Bool = false) {

        self.windows = windows
        self.failing = failing
    }

    func read(_ samples: [Float]) throws -> [Word] {

        sampleCounts.append(samples.count)
        if failing { throw Failed() }
        return windows.isEmpty ? [] : windows.removeFirst()
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
    /// word read on both sides of a chunk's edge once.
    nonisolated let chunkWords: [String]

    init() throws {

        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("../../../docs/research/spike/fixtures/terms-shift-0.jsonl")
            .standardizedFileURL
        let windows = try String(contentsOf: url, encoding: .utf8)
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
        }
        chunkWords = words
    }

    func read(_ samples: [Float]) -> [Word] {

        sampleCounts.append(samples.count)
        guard next < windows.count else { return [] }
        let window = windows[next]
        next += 1
        return window.words.map { Word($0.w, start: $0.s - window.start, end: $0.e - window.start) }
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
