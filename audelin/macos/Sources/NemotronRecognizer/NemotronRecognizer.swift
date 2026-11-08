import AudioConversion
import Foundation
import LiveText

/// Decodes one track's 16 kHz mono audio, returning every token so far in
/// audio order, including any tokens inserted among earlier ones.
public protocol TokenDecoder: Sendable {

    /// Seconds of audio the model decodes at a time.
    var chunk: Double { get }

    func feed(_ samples: [Float]) async throws -> [DecodedToken]
    func finish() async throws -> [DecodedToken]
}

/// A token with its word marker and times from the track's first sample.
public struct DecodedToken: Equatable, Sendable {

    public var text: String
    public var start: Double
    public var end: Double

    public init(_ text: String, start: Double, end: Double) {

        self.text = text
        self.start = start
        self.end = end
    }
}

/// Hears a track with streaming Nemotron 3.5, keeping its last word pending
/// until two chunks pass it with nothing new.
public actor NemotronRecognizer: Recognizer {

    private static let rate = 16_000.0

    private let decoder: any TokenDecoder
    private var converter: Converter?
    private var words: [Word] = []
    /// The first word not final at the last report, including any word
    /// overlapping the last word's time.
    private var reportedCount = 0
    private var pendingFrom: Double?
    private var finalThrough: Double?
    /// Seconds of audio fed to the decoder.
    private var fed = 0.0

    public init(decoder: any TokenDecoder) {

        self.decoder = decoder
    }

    public func hear(_ chunk: AudioChunk) async throws -> Hearing {

        let samples = try convert(chunk)
        fed += Double(samples.count) / Self.rate
        return report(try await decoder.feed(samples), finished: false)
    }

    public func finish() async throws -> Hearing {

        if let converter {
            _ = try await decoder.feed(converter.flush())
        }
        converter = nil
        return report(try await decoder.finish(), finished: true)
    }

    /// Live text settles by end time and drops a reported word that starts
    /// before a settled word ends, so nothing settles past a pending word's
    /// start, and overlapping words stay in the report until the last word
    /// can settle too. Once two chunks pass the last word with nothing new,
    /// it is final too.
    private func report(_ tokens: [DecodedToken], finished: Bool) -> Hearing {

        let next = joined(tokens)
        let quiet = next.last.map { fed >= $0.end + 2 * decoder.chunk } ?? false
        let allFinal = finished || quiet
        let through = finality(of: next, allFinal: allFinal)
        guard finished || next != words else {
            guard through != finalThrough else { return Hearing(words: []) }
            settle(through)
            return Hearing(words: [], finalThrough: through)
        }

        let unchanged = zip(words, next).prefix { $0 == $1 }.count
        let start = min(unchanged, reportedCount, next.count)
        let reported = Array(next[start...])
        let changedFrom = unchanged < words.count ? words[unchanged].start : nil
        let from = [pendingFrom, changedFrom, reported.first?.start].compactMap { $0 }.min()

        words = next
        settle(through)
        return Hearing(words: reported, from: from, finalThrough: through)
    }

    private func finality(of words: [Word], allFinal: Bool) -> Double? {

        guard !words.isEmpty else { return finalThrough }
        let finalEnd = (allFinal ? words[...] : words.dropLast()).map(\.end).max() ?? 0
        let pendingEnd = allFinal ? nil : words.last?.end
        var through = min(finalEnd, pendingEnd?.nextDown ?? finalEnd)
        while let pendingStart = words.filter({ $0.end > through }).map(\.start).min(), pendingStart < through {
            through = pendingStart
        }
        return through
    }

    private func settle(_ through: Double?) {

        finalThrough = through
        reportedCount = words.firstIndex { $0.end > through ?? -.infinity } ?? words.count
        pendingFrom = reportedCount < words.count ? words[reportedCount].start : nil
    }

    /// A word starts at its marker and ends at its last token.
    private func joined(_ tokens: [DecodedToken]) -> [Word] {

        var words: [Word] = []
        for token in tokens {
            if token.text.hasPrefix("▁") || token.text.hasPrefix(" ") || words.isEmpty {
                words.append(Word(token.text.trimmingCharacters(in: CharacterSet(charactersIn: " ▁")), start: token.start, end: token.end))
            } else {
                words[words.count - 1].text += token.text
                words[words.count - 1].end = token.end
            }
        }
        return words.filter { !$0.text.isEmpty }
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
