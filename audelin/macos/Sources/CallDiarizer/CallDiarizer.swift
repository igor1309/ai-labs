import AVFoundation
import AudioConversion
import ModelLoading

/// Reads a finished call track and chooses an offline speaker diarizer.
public struct CallDiarizer: Sendable {

    public enum Model: Equatable, Sendable { case nemotron, vbx }

    /// One speaker turn, in seconds from the track's first sample.
    public struct Turn: Equatable, Sendable {
        public let speaker: Int
        public let start: Double
        public let end: Double
        public init(speaker: Int, start: Double, end: Double) { self.speaker = speaker; self.start = start; self.end = end }
    }

    public struct Diarization: Equatable, Sendable {
        public let model: Model
        public let turns: [Turn]
        public init(model: Model, turns: [Turn]) { self.model = model; self.turns = turns }
    }

    private let binding: any DiarizationBinding
    /// Nemotron is downloaded and loaded once and kept for every later pass; a failed
    /// load is tried again by the next one.
    private let nemotron: SharedModel<@Sendable ([Float]) async throws -> [EngineTurn]>

    public init(binding: any DiarizationBinding) {
        self.binding = binding
        nemotron = SharedModel { try await binding.loadNemotron() }
    }

    /// Starts loading Nemotron without waiting for it, so a pass after the call need not
    /// wait for its first download.
    public func prepare() async { _ = await nemotron.load() }

    /// `speakers`: the number of remote speakers when the caller knows it.
    public func diarize(_ track: URL, speakers: Int? = nil) async throws -> Diarization {

        let samples = try Self.samples(of: track)
        guard !samples.isEmpty else { return Diarization(model: .nemotron, turns: []) }
        let beyondNemotron = speakers.map { $0 > binding.nemotronSlots } ?? false
        if !beyondNemotron {
            do {
                let run = try await nemotron.load().value
                let turns = try await run(samples).sorted { $0.start < $1.start }.map { turn in
                    guard let speaker = Int(turn.speaker) else { throw InvalidSpeaker() }
                    return Turn(speaker: speaker, start: turn.start, end: turn.end)
                }
                return Diarization(model: .nemotron, turns: turns)
            } catch let error as CancellationError {
                throw error
            } catch {
                // Nemotron failing to load or run, or naming a speaker that is
                // not a slot number, leaves the pass to VBx.
            }
        }
        let engineTurns = try await binding.vbx(samples, speakers: speakers).sorted { $0.start < $1.start }
        var speakersByName: [String: Int] = [:]
        let turns = engineTurns.map { turn in
            let speaker = speakersByName[turn.speaker] ?? speakersByName.count
            speakersByName[turn.speaker] = speaker
            return Turn(speaker: speaker, start: turn.start, end: turn.end)
        }
        return Diarization(model: .vbx, turns: turns)
    }

    private struct InvalidSpeaker: Error {}

    /// The track as 16 kHz mono floats, the model's input.
    private static func samples(of url: URL) throws -> [Float] {

        let file = try AVAudioFile(forReading: url, commonFormat: .pcmFormatFloat32, interleaved: false)
        let rate = file.processingFormat.sampleRate
        let converter = try Converter(from: rate, to: 16_000)
        var result: [Float] = []
        let chunk: AVAudioFrameCount = 48_000 * 10
        while file.framePosition < file.length {
            guard let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: chunk) else { break }
            try file.read(into: buffer, frameCount: chunk)
            guard buffer.frameLength > 0, let channels = buffer.floatChannelData else { break }
            let count = Int(buffer.frameLength)
            let channelCount = Int(buffer.format.channelCount)
            var mono = [Float](repeating: 0, count: count)
            for channel in 0..<channelCount {
                for frame in 0..<count { mono[frame] += channels[channel][frame] / Float(channelCount) }
            }
            result += try converter.convertAvailable(mono)
        }
        return result + (try converter.flush())
    }
}
