// Replays recorded tracks through Audelin's recognisers and Live text, as
// the app would hear them live, and measures each recogniser.
//
// For each track and recogniser it writes `<track>-<recogniser>.md` (the
// settled segments) into the output directory and appends a row to
// `summary.md` there.
//
// With --split, each channel of a file is a track of its own: Amanu keeps a
// call as one stereo file, the mic on the left and the system on the right.
//
// --pause sets Live text's pause, 2 s by default; a pause settles the words
// before it.
//
// usage: audelin-replay <output-dir> <track>... [--only parakeet|nemotron|hybrid] [--split] [--pause <s>]
import AVFoundation
import Foundation
import LiveText
import NemotronRecognizer
import ParakeetRecognizer

var arguments = Array(CommandLine.arguments.dropFirst())
var only: String?
var pause = 2.0
if let flag = arguments.firstIndex(of: "--pause"), flag + 1 < arguments.count, let value = Double(arguments[flag + 1]) {
    pause = value
    arguments.removeSubrange(flag...(flag + 1))
}
let split = arguments.contains("--split")
arguments.removeAll { $0 == "--split" }
if let flag = arguments.firstIndex(of: "--only"), flag + 1 < arguments.count {
    only = arguments[flag + 1]
    arguments.removeSubrange(flag...(flag + 1))
}
guard arguments.count >= 2 else {
    FileHandle.standardError.write("usage: audelin-replay <output-dir> <track>... [--only parakeet|nemotron|hybrid] [--split] [--pause <s>]\n".data(using: .utf8)!)
    exit(2)
}
let output = URL(fileURLWithPath: arguments[0])
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
let tracks = arguments.dropFirst().map { URL(fileURLWithPath: $0) }

/// A recogniser's name and how to load it.
struct Model: Sendable {

    let name: String
    let load: @Sendable () async throws -> any Recognizer
}

let models = [
    Model(name: "parakeet") { try await ParakeetRecognizer() },
    Model(name: "nemotron") { try await NemotronRecognizer() },
    Model(name: "hybrid") { Hybrid(settling: try await ParakeetRecognizer(), showing: try await NemotronRecognizer()) },
].filter { only == nil || $0.name == only }

/// The words a recogniser's reports add up to: each report replaces the
/// words from where it starts.
struct Heard {

    private(set) var words: [Word] = []
    private(set) var finalThrough = -Double.infinity

    mutating func take(_ hearing: Hearing) {

        if let from = hearing.from ?? hearing.words.first?.start {
            words = words.filter { $0.start < from } + hearing.words
        }
        finalThrough = max(finalThrough, hearing.finalThrough ?? finalThrough)
    }
}

/// Shows the fast recogniser's words and settles the better one's: the
/// settling recogniser's final words, then the showing one's words after
/// them, pending.
actor Hybrid: Recognizer {

    private let settling: any Recognizer
    private let showing: any Recognizer
    private var settled = Heard()
    private var shown = Heard()

    init(settling: any Recognizer, showing: any Recognizer) {

        self.settling = settling
        self.showing = showing
    }

    func hear(_ chunk: AudioChunk) async throws -> Hearing {

        settled.take(try await settling.hear(chunk))
        shown.take(try await showing.hear(chunk))
        return report()
    }

    func finish() async throws -> Hearing {

        settled.take(try await settling.finish())
        shown.take(try await showing.finish())
        return Hearing(words: settled.words, from: -.infinity, finalThrough: .infinity)
    }

    /// Every word not yet final, from scratch: Live text keeps its settled
    /// words and drops any reported over them.
    private func report() -> Hearing {

        let through = settled.finalThrough
        let words = settled.words.filter { $0.end <= through } + shown.words.filter { $0.start >= through }
        return Hearing(words: words, from: -.infinity, finalThrough: through)
    }
}

/// A track's audio in 0.1 s chunks at its own rate: one channel, or all of
/// them averaged.
struct TrackAudio: AudioSource, @unchecked Sendable {

    let file: AVAudioFile
    let channel: Int?

    var duration: Double { Double(file.length) / file.processingFormat.sampleRate }

    func audio() -> AsyncStream<AudioChunk> {

        let format = file.processingFormat
        let block = AVAudioFrameCount(format.sampleRate / 10)
        let file = file
        return AsyncStream {
            guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: block),
                  (try? file.read(into: buffer, frameCount: block)) != nil,
                  buffer.frameLength > 0 else { return nil }
            let channels = channel.map { [$0] } ?? Array(0..<Int(format.channelCount))
            let count = Int(buffer.frameLength)
            var samples = [Float](repeating: 0, count: count)
            for channel in channels {
                let data = buffer.floatChannelData![channel]
                for index in 0..<count { samples[index] += data[index] / Float(channels.count) }
            }
            return AudioChunk(samples: samples, sampleRate: format.sampleRate)
        }
    }
}

/// Passes chunks to a recogniser and keeps each report with how much audio
/// had been fed when it came.
actor Tap: Recognizer {

    private let inner: any Recognizer
    private(set) var fed = 0.0
    private(set) var reports: [(fed: Double, hearing: Hearing)] = []

    init(_ inner: any Recognizer) {

        self.inner = inner
    }

    func hear(_ chunk: AudioChunk) async throws -> Hearing {

        fed += Double(chunk.samples.count) / chunk.sampleRate
        let hearing = try await inner.hear(chunk)
        reports.append((fed, hearing))
        return hearing
    }

    func finish() async throws -> Hearing {

        let hearing = try await inner.finish()
        reports.append((fed, hearing))
        return hearing
    }
}

/// A final word with when it was first shown and when it became final, in
/// seconds of audio fed.
struct Timed {

    let word: Word
    var shown: Double
    var final: Double
}

/// The same word heard about the same time, punctuation, case and «ё»
/// aside. Nemotron starts a word about 0.3 s later than Parakeet does, and a
/// trailing punctuation token can stretch its end by seconds, so starts
/// within a second match.
func same(_ a: Word, _ b: Word) -> Bool {

    letters(a.text) == letters(b.text) && abs(a.start - b.start) < 1
}

func letters(_ text: String) -> String {

    text.lowercased().replacingOccurrences(of: "ё", with: "е").filter(\.isLetter)
}

/// Searches only the latest entries: a word can only match one heard near
/// its own time.
func recent<T>(_ list: [T], _ match: (T) -> Bool) -> T? {

    list.suffix(400).last(where: match)
}

func percentile(_ values: [Double], _ fraction: Double) -> Double {

    guard !values.isEmpty else { return .nan }
    let sorted = values.sorted()
    return sorted[min(sorted.count - 1, Int(Double(sorted.count - 1) * fraction + 0.5))]
}

func seconds(_ values: [Double]) -> String {

    String(format: "%.2f / %.2f / %.2f", percentile(values, 0.5), percentile(values, 0.9), values.max() ?? .nan)
}

func clock(_ seconds: Double) -> String {

    String(format: "%02d:%02d", Int(seconds) / 60, Int(seconds) % 60)
}

let summary = output.appendingPathComponent("summary.md")
if !FileManager.default.fileExists(atPath: summary.path) {
    try """
    | Track | Recogniser | Words final | Words settled | Shown delay, median / p90 / max | Final delay, median / p90 / max | Shown, never final | Compute / audio | Load |
    |---|---|---|---|---|---|---|---|---|

    """.write(to: summary, atomically: true, encoding: .utf8)
}

let sources = try tracks.flatMap { track -> [(name: String, url: URL, channel: Int?)] in
    let name = track.deletingPathExtension().lastPathComponent
    let channels = Int(try AVAudioFile(forReading: track).processingFormat.channelCount)
    guard split, channels > 1 else { return [(name, track, nil)] }
    let names = channels == 2 ? ["left", "right"] : (1...channels).map { "ch\($0)" }
    return names.enumerated().map { ("\(name)-\($1)", track, $0) }
}

for source in sources {
    for model in models {
        let name = source.name
        let audio = TrackAudio(file: try AVAudioFile(forReading: source.url), channel: source.channel)

        let loading = Date()
        let tap = Tap(try await model.load())
        let load = Date().timeIntervalSince(loading)

        let live = LiveText(recognizer: tap, pause: pause)
        let collecting = Task {
            var last: Segments?
            for await update in live.updates { last = update }
            return last
        }
        let started = Date()
        await live.listen(to: audio)
        let compute = Date().timeIntervalSince(started)
        let segments = await collecting.value

        // Every word a report calls final, once, with when it was first shown.
        var finals: [Timed] = []
        var shown: [(fed: Double, word: Word)] = []
        for (fed, hearing) in await tap.reports {
            for word in hearing.words {
                if recent(shown, { same($0.word, word) }) == nil { shown.append((fed, word)) }
                if word.end <= hearing.finalThrough ?? -.infinity, recent(finals, { same($0.word, word) }) == nil {
                    let first = recent(shown) { same($0.word, word) }?.fed ?? fed
                    finals.append(Timed(word: word, shown: first, final: fed))
                }
            }
        }
        let byStart = finals.sorted { $0.word.start < $1.word.start }
        var neverFinal = 0
        var next = 0
        for seen in shown.sorted(by: { $0.word.start < $1.word.start }) {
            while next < byStart.count, byStart[next].word.end < seen.word.start - 30 { next += 1 }
            if !byStart[next...].prefix(400).contains(where: { same($0.word, seen.word) }) { neverFinal += 1 }
        }
        let settledWords = segments?.all.flatMap { $0.settled.split(separator: " ") }.count ?? 0

        let text = (segments?.all ?? []).map { "[\(clock($0.start))] \($0.settled)" }.joined(separator: "\n\n")
        let ending = segments?.ending.map { "\($0)" } ?? "none"
        try "# \(name) — \(model.name)\n\nEnding: \(ending)\n\n\(text)\n"
            .write(to: output.appendingPathComponent("\(name)-\(model.name).md"), atomically: true, encoding: .utf8)

        let tsv = finals.map { String(format: "%.2f\t%.2f\t%.2f\t%.2f\t", $0.word.start, $0.word.end, $0.shown, $0.final) + $0.word.text }
        try (["start\tend\tshown\tfinal\tword"] + tsv).joined(separator: "\n")
            .write(to: output.appendingPathComponent("\(name)-\(model.name).tsv"), atomically: true, encoding: .utf8)

        let row = [
            name, model.name, "\(finals.count)", "\(settledWords)",
            seconds(finals.map { $0.shown - $0.word.end }),
            seconds(finals.map { $0.final - $0.word.end }),
            String(format: "%d (%.1f%%)", neverFinal, 100 * Double(neverFinal) / Double(max(finals.count, 1))),
            String(format: "%.3f", compute / audio.duration),
            String(format: "%.1f s", load),
        ]
        let line = "| " + row.joined(separator: " | ") + " |\n"
        let handle = try FileHandle(forWritingTo: summary)
        handle.seekToEndOfFile()
        handle.write(line.data(using: .utf8)!)
        try handle.close()
        print(line, terminator: "")
    }
}
