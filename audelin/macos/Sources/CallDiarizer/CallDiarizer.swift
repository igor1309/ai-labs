import AVFoundation
import AudioConversion
import FluidAudio

/// The after-call speaker pass: diarizes a finished call track with Nemotron 3 (`fast128`),
/// which LAB-1103 measured at 2.7 % DER and about 11 s per hour of call.
public struct CallDiarizer: Sendable {

    /// One speaker turn on the call track, in seconds from the track's first sample.
    public struct Turn: Equatable, Sendable {
        public let speaker: Int
        public let start: Double
        public let end: Double
        public init(speaker: Int, start: Double, end: Double) { self.speaker = speaker; self.start = start; self.end = end }
    }

    public init() {}

    public func turns(of track: URL) async throws -> [Turn] {

        let samples = try Self.samples(of: track)
        guard !samples.isEmpty else { return [] }
        let config = Nemotron3Config.fast128
        let models = try await Nemotron3Models.loadFromHuggingFace(config: config)
        let diarizer = Nemotron3Diarizer(config: config, models: models)
        let (probabilities, frames) = try diarizer.processComplete(samples)
        return Nemotron3Diarizer.segments(probabilities: probabilities, frameCount: frames, numSpeakers: config.numSpeakers)
            .map { Turn(speaker: $0.speakerIndex, start: Double($0.startSeconds), end: Double($0.endSeconds)) }
    }

    /// The track as 16 kHz mono floats, the model's input.
    static func samples(of url: URL) throws -> [Float] {

        let file = try AVAudioFile(forReading: url, commonFormat: .pcmFormatFloat32, interleaved: false)
        let rate = file.processingFormat.sampleRate
        let converter = try Converter(from: rate, to: 16_000)
        var result: [Float] = []
        let chunk: AVAudioFrameCount = 48_000 * 10
        while file.framePosition < file.length {
            guard let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: chunk) else { break }
            try file.read(into: buffer, frameCount: chunk)
            guard buffer.frameLength > 0, let channel = buffer.floatChannelData?[0] else { break }
            result += try converter.convertAvailable(Array(UnsafeBufferPointer(start: channel, count: Int(buffer.frameLength))))
        }
        return result + (try converter.flush())
    }
}
