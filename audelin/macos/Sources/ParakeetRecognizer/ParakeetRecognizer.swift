@preconcurrency import AVFoundation
import LiveText

/// Reads one window of 16 kHz mono audio, from a fresh start.
public protocol WindowReader: Sendable {

    /// The words in the window, timed from the window's first sample.
    func read(_ samples: [Float]) async throws -> [Word]
}

/// Hears a track with Parakeet v3 in overlapping windows of its own: a 4 s
/// chunk with 2 s of audio on each side.
public actor ParakeetRecognizer: Recognizer {

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
        finalThrough = max(finalThrough, words.last?.end ?? 0)
        return report()
    }

    private func readWindow() async throws {

        let start = max(0, chunkStart - Self.context)
        let end = min(audio.end, chunkStart + Self.chunk + Self.context)
        let chunkEnd = chunkStart + Self.chunk
        let read = try await reader.read(audio.samples(from: start, to: end))
            .map { Word($0.text, start: $0.start + start, end: $0.end + start) }

        // A pending word that starts before the window can never be read
        // again, so its reading is final.
        while finalCount < words.count, words[finalCount].start < start {
            finalThrough = max(finalThrough, words[finalCount].end)
            finalCount += 1
        }

        // Pending words whose middle lies before the chunk keep their
        // reading; the window reads the rest.
        let kept = words[finalCount...].filter { middle($0) < chunkStart }
        let known = words[max(0, finalCount - 8)..<finalCount] + kept
        let new = read.filter { word in
            middle(word) >= chunkStart && !known.contains { same($0, word) }
        }
        words = words[..<finalCount] + kept + new

        finalThrough = max(finalThrough, chunkEnd)
        while finalCount < words.count, words[finalCount].end <= finalThrough {
            finalCount += 1
        }

        chunkStart = chunkEnd
        audio.drop(before: chunkStart - Self.context)
    }

    /// Everything from the earliest word not final at the last report on.
    private func report() -> Hearing {

        let reported = Array(words[reportedCount...])
        let from = [pendingFrom, reported.first?.start].compactMap { $0 }.min()
        reportedCount = finalCount
        pendingFrom = finalCount < words.count ? words[finalCount].start : nil
        return Hearing(words: reported, from: from, finalThrough: finalThrough)
    }

    private func middle(_ word: Word) -> Double {

        (word.start + word.end) / 2
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

/// Converts one track's audio from its sample rate, keeping the filter's
/// state from chunk to chunk.
private final class Converter {

    let inputRate: Double
    private let converter: AVAudioConverter
    private let input: AVAudioFormat
    private let output: AVAudioFormat

    init(from inputRate: Double, to outputRate: Double) throws {

        guard
            let input = AVAudioFormat(standardFormatWithSampleRate: inputRate, channels: 1),
            let output = AVAudioFormat(standardFormatWithSampleRate: outputRate, channels: 1),
            let converter = AVAudioConverter(from: input, to: output)
        else { throw ConversionFailed() }
        self.inputRate = inputRate
        self.input = input
        self.output = output
        self.converter = converter
    }

    func convert(_ samples: [Float]) throws -> [Float] {

        guard !samples.isEmpty else { return [] }
        guard let buffer = AVAudioPCMBuffer(pcmFormat: input, frameCapacity: AVAudioFrameCount(samples.count))
        else { throw ConversionFailed() }
        buffer.frameLength = buffer.frameCapacity
        samples.withUnsafeBufferPointer { buffer.floatChannelData![0].update(from: $0.baseAddress!, count: $0.count) }
        return try run(buffer, capacity: samples.count)
    }

    /// What the filter still holds once the audio has ended.
    func flush() throws -> [Float] {

        try run(nil, capacity: 4_096)
    }

    /// Converts the buffer, or ends the stream when there is none.
    private func run(_ buffer: AVAudioPCMBuffer?, capacity: Int) throws -> [Float] {

        let frames = AVAudioFrameCount(Double(capacity) * output.sampleRate / input.sampleRate) + 64
        guard let result = AVAudioPCMBuffer(pcmFormat: output, frameCapacity: frames) else { throw ConversionFailed() }
        // The converter asks for input before `convert` returns.
        nonisolated(unsafe) var supplied = false
        var error: NSError?
        converter.convert(to: result, error: &error) { _, status in
            if supplied {
                status.pointee = .noDataNow
                return nil
            }
            supplied = true
            status.pointee = buffer == nil ? .endOfStream : .haveData
            return buffer
        }
        if let error { throw error }
        return Array(UnsafeBufferPointer(start: result.floatChannelData![0], count: Int(result.frameLength)))
    }

    struct ConversionFailed: Error {}
}
