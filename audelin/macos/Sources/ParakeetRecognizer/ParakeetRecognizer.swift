import Dispatch
import AudioConversion
import LiveText

/// Reads one window of 16 kHz mono audio, from a fresh start.
public protocol WindowReader: Sendable {

    func read(_ samples: [Float]) async throws -> [WindowWord]
}

/// A word a window reader heard, in seconds from the window's first sample.
public struct WindowWord: Equatable, Sendable {

    public var text: String
    public var start: Double
    public var end: Double

    public init(_ text: String, start: Double, end: Double) {

        self.text = text
        self.start = start
        self.end = end
    }
}

/// Hears a track with Parakeet v3 in overlapping windows of its own: a 4 s
/// chunk with 2 s of audio on each side.
public actor ParakeetRecognizer: Recognizer {

    // Conversion and inference block, so they run on this queue, not the cooperative pool.
    // Inference reaches it through a task executor preference, which default actors and
    // nonisolated async code follow; an actor with its own executor, or an unstructured
    // task it starts, does not.
    private nonisolated let queue = DispatchSerialQueue(label: "audelin.ParakeetRecognizer")
    public nonisolated var unownedExecutor: UnownedSerialExecutor { queue.asUnownedSerialExecutor() }

    private static let rate = 16_000.0
    private static let chunk = 4.0
    private static let context = 2.0

    private let reader: any WindowReader
    private var audio = Audio()
    private var converter: Converter?
    private var chunkStart = 0.0

    /// Every word so far in track time; words before `finalCount` are final.
    private var words: [Word] = []
    private var finalCount = 0
    /// Where the last chunk read ends, or the last final word if later.
    private var finalThrough = 0.0
    /// The first word the next report carries, and where the last report's
    /// pending words began.
    private var reportedCount = 0
    private var pendingFrom: Double?

    public init(reader: any WindowReader) {

        self.reader = reader
    }

    public func hear(_ chunk: AudioChunk) async throws -> Hearing {

        audio.append(try convert(chunk))
        var read = false
        while audio.end >= chunkStart + Self.chunk + Self.context {
            try await readWindow()
            read = true
        }
        return read ? report() : Hearing(words: [])
    }

    public func finish() async throws -> Hearing {

        if let converter { audio.append(try converter.flush()) }
        converter = nil
        while chunkStart < audio.end {
            try await readWindow()
        }
        finalCount = words.count
        finalThrough = max(finalThrough, words.map(\.end).max() ?? 0)
        return report()
    }

    private func readWindow() async throws {

        let start = max(0, chunkStart - Self.context)
        let end = min(audio.end, chunkStart + Self.chunk + Self.context)
        let chunkEnd = chunkStart + Self.chunk
        let read = try await withTaskExecutorPreference(queue) { try await reader.read(audio.samples(from: start, to: end)) }
            .map { Word($0.text, start: $0.start + start, end: $0.end + start) }

        // A pending word that starts before the window can never be read
        // again, so its reading is final.
        while finalCount < words.count, words[finalCount].start < start {
            finalCount += 1
        }

        // Pending words whose middle lies before the chunk keep their
        // reading; the window reads the rest. Its reading of one of the rest
        // may place it a little before the chunk, and still replaces it.
        let kept = words[finalCount...].filter { middle($0) < chunkStart }
        let reread = words[finalCount...].filter { middle($0) >= chunkStart }
        let known = words[max(0, finalCount - 8)..<finalCount] + kept
        let new = read.filter { word in
            guard !known.contains(where: { same($0, word) }) else { return false }
            if middle(word) >= chunkStart { return true }
            let closest = reread.map { overlap($0, word) }.max() ?? 0
            return closest > 0 && known.allSatisfy { overlap($0, word) < closest }
        }
        words = words[..<finalCount] + kept + new

        while finalCount < words.count, words[finalCount].end <= chunkEnd {
            finalCount += 1
        }
        finalThrough = max(finalThrough, chunkEnd, words[..<finalCount].map(\.end).max() ?? 0)

        chunkStart = chunkEnd
        audio.drop(before: chunkStart - Self.context)
    }

    /// Everything from the earliest word not final at the last report on,
    /// final up to just before a pending word ends, and no later than a
    /// pending word's start: Live text settles by time and drops a word
    /// starting before a settled one ends, so a final word overlapping a
    /// pending one shows as final only once that word is.
    private func report() -> Hearing {

        let reported = Array(words[reportedCount...])
        let from = [pendingFrom, reported.first?.start].compactMap { $0 }.min()
        let pending = words[finalCount...]
        var through = min(finalThrough, pending.map(\.end).min()?.nextDown ?? finalThrough)
        while let start = pending.filter({ $0.end > through }).map(\.start).min(), start < through {
            through = start
        }
        reportedCount = finalCount
        pendingFrom = finalCount < words.count ? words[finalCount].start : nil
        // The next window starts here, and a window's words start inside it.
        return Hearing(words: reported, from: from, finalThrough: through, noWordBefore: max(0, chunkStart - Self.context))
    }

    private func middle(_ word: Word) -> Double {

        (word.start + word.end) / 2
    }

    /// Seconds two words share; negative when apart.
    private func overlap(_ one: Word, _ other: Word) -> Double {

        min(one.end, other.end) - max(one.start, other.start)
    }

    /// The same word read twice: the same letters at overlapping times.
    private func same(_ one: Word, _ other: Word) -> Bool {

        one.start < other.end && other.start < one.end && letters(one.text) == letters(other.text)
    }

    private func letters(_ text: String) -> String {

        text.lowercased().filter { $0.isLetter || $0.isNumber }
    }

    private func convert(_ chunk: AudioChunk) throws -> [Float] {

        if chunk.sampleRate == Self.rate, converter == nil { return chunk.samples }
        if converter?.inputRate != chunk.sampleRate {
            let flushed = try converter?.flush() ?? []
            converter = chunk.sampleRate == Self.rate ? nil : try Converter(from: chunk.sampleRate, to: Self.rate)
            return flushed + (try converter?.convert(chunk.samples) ?? chunk.samples)
        }
        return try converter!.convert(chunk.samples)
    }
}

/// The track's 16 kHz audio from where the next window starts.
private struct Audio {

    private static let rate = 16_000.0

    private var samples: [Float] = []
    /// Samples dropped from the front.
    private var dropped = 0

    var end: Double { Double(dropped + samples.count) / Self.rate }

    mutating func append(_ more: [Float]) {

        samples += more
    }

    func samples(from start: Double, to end: Double) -> [Float] {

        let lower = max(0, Int(start * Self.rate) - dropped)
        let upper = min(samples.count, Int(end * Self.rate) - dropped)
        return lower < upper ? Array(samples[lower..<upper]) : []
    }

    mutating func drop(before time: Double) {

        let count = min(samples.count, max(0, Int(time * Self.rate) - dropped))
        samples.removeFirst(count)
        dropped += count
    }
}
