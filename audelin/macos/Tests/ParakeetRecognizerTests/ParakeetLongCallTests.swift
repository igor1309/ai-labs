import Foundation
import LiveText
import Testing
@testable import ParakeetRecognizer

/// A long call heard through overlapping windows, read the way a model reads
/// them: word times drift a little from one window to the next, a word cut
/// by a window's edge comes out clipped, and a word in the right context may
/// be misheard until the next window reads it whole.
struct ParakeetLongCallTests {

    @Test func everyWordSpokenInALongCallIsHeardOnceInOrder() async throws {

        let minutes = Double(ProcessInfo.processInfo.environment["AUDELIN_PARAKEET_MINUTES"] ?? "") ?? 20
        let spoken = Spoken(seconds: minutes * 60)
        let reader = DriftingReader(spoken: spoken)

        let heard = await hear(ParakeetRecognizer(reader: reader), seconds: minutes * 60)

        #expect(heard.pending.isEmpty, "words still pending after the call ended: \(heard.pending.prefix(10))")
        // Lost words are removals from what was said; words heard twice,
        // misheard or out of order are insertions.
        let expected = spoken.words.map(\.text)
        let difference = heard.words.difference(from: expected)
        let lost = difference.removals.map { change -> String in
            guard case let .remove(_, word, _) = change else { return "" }
            return word
        }
        let added = difference.insertions.map { change -> String in
            guard case let .insert(_, word, _) = change else { return "" }
            return word
        }
        #expect(lost.isEmpty, "\(lost.count) of \(expected.count) words lost, such as \(lost.prefix(10))")
        #expect(added.isEmpty, "\(added.count) words heard twice, misheard or out of order, such as \(added.prefix(10))")
    }

    @Test func aWordAcrossAChunkEdgeIsKeptWhenTheNextWindowPlacesItEarlier() async throws {

        // The word's middle is 4.02 s in the first window, past its chunk, so
        // it is pending; the next window reads its middle at 3.98 s, before
        // its own chunk.
        let reader = ScriptedWindows([
            [WindowWord("слово", start: 3.82, end: 4.22)],
            [WindowWord("слово", start: 1.78, end: 2.18)],
        ])

        let heard = await hear(ParakeetRecognizer(reader: reader), seconds: 10)

        #expect(heard.words == ["слово"])
    }
}

/// The track's words: 0.2 to 0.5 s long with 0.1 to 0.2 s between them, in
/// sentences of 6 to 10 s with pauses of 1 to 4 s. Each word is its own text,
/// except that now and then a word is said twice. Their times fall anywhere
/// against the windows, so some words cross a chunk's edge.
private struct Spoken: Sendable {

    let words: [Word]

    init(seconds: Double) {

        var words: [Word] = []
        var time = 0.5
        var sentenceEnd = time + 6
        while time + 0.5 < seconds {
            let n = words.count
            if time >= sentenceEnd {
                time += 1 + Double(mix(n, 1) % 4)
                sentenceEnd = time + 6 + Double(mix(n, 2) % 5)
                continue
            }
            let length = 0.2 + Double(mix(n, 3) % 4) * 0.1
            let text = n % 37 == 1 ? words[n - 1].text : "слово\(n)"
            words.append(Word(text, start: time, end: time + length))
            time += length + 0.1 + Double(mix(n, 4) % 3) * 0.05
        }
        self.words = words
    }
}

/// Reads whatever stretch of the track a window holds, from the time each
/// sample carries.
private actor DriftingReader: WindowReader {

    private let spoken: Spoken
    private var windows = 0

    init(spoken: Spoken) {

        self.spoken = spoken
    }

    func read(_ samples: [Float]) -> [WindowWord] {

        let window = windows
        windows += 1
        guard let first = samples.first, let last = samples.last else { return [] }
        let start = Double(first)
        let end = Double(last) + 1 / 16_000
        // A full window's last 2 s are its right context, read again by the
        // next window; a window cut short by the track's end has none.
        let rightContext = samples.count == 8 * 16_000 ? end - 2 : .infinity

        var lower = 0, upper = spoken.words.count
        while lower < upper {
            let middle = (lower + upper) / 2
            if spoken.words[middle].end <= start { lower = middle + 1 } else { upper = middle }
        }
        let near = spoken.words.indices[lower...].prefix { spoken.words[$0].start < end }
        return near.compactMap { index in
            let word = spoken.words[index]
            let inside = (min(word.end, end) - max(word.start, start)) / (word.end - word.start)
            guard inside >= 0.5 else { return nil }
            // Up to 40 ms either way, in 10 ms steps, for each word in each window.
            let drift = Double(Int(mix(window, index) % 9) - 4) * 0.01
            var text = word.text
            if inside < 1 {
                text.removeLast()
            } else if word.start >= rightContext, (window + index) % 5 == 0 {
                text = "с" + text
            }
            return WindowWord(
                text,
                start: max(0, max(word.start, start) + drift - start),
                end: min(end, word.end) + drift - start
            )
        }
    }
}

/// Scatters two numbers into a hash, so timings vary without a pattern that
/// lines up with the windows.
private func mix(_ one: Int, _ other: Int) -> UInt64 {

    var hash = UInt64(one) &* 0x9E37_79B9_7F4A_7C15 ^ UInt64(other) &* 0xBF58_476D_1CE4_E5B9
    hash ^= hash >> 31
    hash = hash &* 0x94D0_49BB_1331_11EB
    hash ^= hash >> 29
    return hash
}

private actor ScriptedWindows: WindowReader {

    private var script: [[WindowWord]]

    init(_ script: [[WindowWord]]) {

        self.script = script
    }

    func read(_ samples: [Float]) -> [WindowWord] {

        script.isEmpty ? [] : script.removeFirst()
    }
}

/// Runs the recogniser under Live text over that many seconds of audio in
/// 0.1 s pieces, keeping only the last text.
private func hear(_ recognizer: ParakeetRecognizer, seconds: Double) async -> (words: [String], pending: [String]) {

    let live = LiveText(recognizer: recognizer)
    let last = Task {
        var last: Segments?
        for await update in live.updates { last = update }
        return last
    }
    await live.listen(to: ClockAudio(pieces: Int(seconds * 10)))
    let segments = await last.value?.all ?? []
    let words = { (text: String) in text.split(separator: " ").map(String.init) }
    return (segments.flatMap { words($0.settled) + words($0.pending) }, segments.flatMap { words($0.pending) })
}

/// Audio whose every sample is its own time in seconds, so a reader knows
/// which stretch of the track it was given.
private struct ClockAudio: AudioSource {

    let pieces: Int

    func audio() -> AsyncStream<AudioChunk> {

        var next = 0
        return AsyncStream { [pieces] in
            guard next < pieces else { return nil }
            let first = next * 1_600
            next += 1
            return AudioChunk(samples: (first..<first + 1_600).map { Float(Double($0) / 16_000) }, sampleRate: 16_000)
        }
    }
}
