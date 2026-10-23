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

        guard !samples.isEmpty else { return [] }
        guard let buffer = AVAudioPCMBuffer(pcmFormat: input, frameCapacity: AVAudioFrameCount(samples.count))
        else { throw ConversionFailed() }
        buffer.frameLength = buffer.frameCapacity
        samples.withUnsafeBufferPointer { buffer.floatChannelData![0].update(from: $0.baseAddress!, count: $0.count) }
        return try run(buffer, capacity: samples.count)
    }

    /// What the filter still holds once the audio has ended.
    public func flush() throws -> [Float] {

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
