@preconcurrency import AVFoundation

/// Converts one track's audio from its sample rate, keeping the filter's
/// state from chunk to chunk.
public final class Converter {

    public let inputRate: Double
    private let converter: AVAudioConverter
    private let input: AVAudioFormat
    private let output: AVAudioFormat

    public init(from inputRate: Double, to outputRate: Double) throws {

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

    public func convert(_ samples: [Float]) throws -> [Float] {

        try convert(samples, draining: false)
    }

    /// Drains available output until the converter needs more input. In particular,
    /// a tiny chunk must not be lost when buffered output fills the first result.
    public func convertAvailable(_ samples: [Float]) throws -> [Float] {

        try convert(samples, draining: true)
    }

    private func convert(_ samples: [Float], draining: Bool) throws -> [Float] {

        guard !samples.isEmpty else { return [] }
        guard let buffer = AVAudioPCMBuffer(pcmFormat: input, frameCapacity: AVAudioFrameCount(samples.count))
        else { throw ConversionFailed() }
        buffer.frameLength = buffer.frameCapacity
        samples.withUnsafeBufferPointer { buffer.floatChannelData![0].update(from: $0.baseAddress!, count: $0.count) }
        return try run(buffer, capacity: samples.count, draining: draining)
    }

    /// What the filter still holds once the audio has ended.
    public func flush() throws -> [Float] {

        try run(nil, capacity: 4_096)
    }

    /// Converts the buffer, or ends the stream when there is none.
    private func run(_ buffer: AVAudioPCMBuffer?, capacity: Int, draining: Bool = false) throws -> [Float] {

        let frames = AVAudioFrameCount(Double(capacity) * output.sampleRate / input.sampleRate) + 64
        guard let result = AVAudioPCMBuffer(pcmFormat: output, frameCapacity: frames) else { throw ConversionFailed() }
        // The converter asks for input before `convert` returns.
        nonisolated(unsafe) var supplied = false
        var samples: [Float] = []
        while true {
            var error: NSError?
            let status = converter.convert(to: result, error: &error) { _, status in
                if supplied {
                    status.pointee = .noDataNow
                    return nil
                }
                supplied = true
                status.pointee = buffer == nil ? .endOfStream : .haveData
                return buffer
            }
            if let error { throw error }
            samples += Array(UnsafeBufferPointer(start: result.floatChannelData![0], count: Int(result.frameLength)))
            if !draining || status != .haveData { return samples }
        }
    }

    struct ConversionFailed: Error {}
}
