import AVFoundation
import BlockingTestWork
import Foundation
import Testing

func withAudioDirectory(_ body: (URL) async throws -> Void) async throws {

    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try await withCleanup {
        try await body(directory)
    } cleanup: {
        try FileManager.default.removeItem(at: directory)
    }
}

func writeWave(_ url: URL, channels: [[Float]], rate: Double) throws {

    let format = try #require(AVAudioFormat(standardFormatWithSampleRate: rate, channels: AVAudioChannelCount(channels.count)))
    let file = try AVAudioFile(forWriting: url, settings: format.settings)
    let count = try #require(channels.first?.count)
    guard count > 0 else { return }
    let buffer = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(count)))
    buffer.frameLength = AVAudioFrameCount(count)
    let data = try #require(buffer.floatChannelData)
    for (channel, samples) in channels.enumerated() {
        try #require(samples.count == count)
        samples.withUnsafeBufferPointer { data[channel].update(from: $0.baseAddress!, count: count) }
    }
    try file.write(from: buffer)
}
