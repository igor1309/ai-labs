import AVFoundation
import LiveText
import Synchronization

/// Speech from a file, as mono samples at the file's own rate.
struct Speech {

    let samples: [Float]
    let rate: Double

    init(path: String) throws {

        let file = try AVAudioFile(forReading: URL(fileURLWithPath: path))
        let format = file.processingFormat
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(file.length)) else {
            throw Options.Failure("cannot read \(path)")
        }
        try file.read(into: buffer)
        guard let channel = buffer.floatChannelData?[0], buffer.frameLength > 0 else {
            throw Options.Failure("\(path) has no audio")
        }
        samples = Array(UnsafeBufferPointer(start: channel, count: Int(buffer.frameLength)))
        rate = format.sampleRate
    }

    var seconds: Double { Double(samples.count) / rate }

    /// `count` samples from `start` on, looping back to the beginning.
    func piece(from start: Int, count: Int) -> [Float] {

        (0..<count).map { samples[(start + $0) % samples.count] }
    }
}

/// How many seconds of audio the rehearsal has fed so far.
final class Fed: Sendable {

    private let fed = Mutex(0.0)

    var seconds: Double { fed.withLock { $0 } }

    func set(_ seconds: Double) { fed.withLock { $0 = seconds } }
}

/// A real recogniser, measured: how much audio it heard, and at each
/// report how far its newest word and its final words trail what was fed.
final class Measured: Recognizer, Sendable {

    struct Lags: Sendable {

        /// Fed audio minus the newest word's end, at each report with words.
        /// It includes any pause after that word, so it bounds the lag from above.
        var newest: [Double] = []
        /// Fed audio minus where the words are final, at each report that says.
        var final: [Double] = []
    }

    private struct State {

        var heard = 0.0
        var lags = Lags()
    }

    private let base: any Recognizer
    private let fed: Fed
    private let state = Mutex(State())

    init(_ base: any Recognizer, fed: Fed) {

        self.base = base
        self.fed = fed
    }

    /// Seconds of audio handed to the recogniser.
    var heard: Double { state.withLock { $0.heard } }

    /// The lags so far, and empties them.
    func takeLags() -> Lags {

        state.withLock { state in
            defer { state.lags = Lags() }
            return state.lags
        }
    }

    func hear(_ chunk: AudioChunk) async throws -> Hearing {

        state.withLock { $0.heard += Double(chunk.samples.count) / chunk.sampleRate }
        let hearing = try await base.hear(chunk)
        note(hearing)
        return hearing
    }

    func finish() async throws -> Hearing { try await base.finish() }

    private func note(_ hearing: Hearing) {

        let fed = fed.seconds
        state.withLock { state in
            if let end = hearing.words.map(\.end).max() { state.lags.newest.append(fed - end) }
            if let final = hearing.finalThrough { state.lags.final.append(fed - final) }
        }
    }
}
