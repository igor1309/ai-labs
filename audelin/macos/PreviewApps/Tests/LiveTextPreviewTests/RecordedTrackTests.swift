import AVFoundation
import Foundation
import LiveText
import Testing
@testable import LiveTextPreview

struct RecordedTrackTests {

    @Test func aTrackIsReadOneChannelAtItsPace() async throws {

        let url = try stereo(seconds: 0.3, left: 0.25, right: -0.5)
        defer { try? FileManager.default.removeItem(at: url) }
        let started = ContinuousClock.now

        var chunks: [AudioChunk] = []
        for await chunk in RecordedTrack(url: url, channel: 1, started: started).audio() { chunks.append(chunk) }

        #expect(chunks.count == 3)
        #expect(chunks.allSatisfy { $0.samples.allSatisfy { $0 == -0.5 } })
        #expect(ContinuousClock.now - started >= .seconds(0.3))
    }

    private func stereo(seconds: Double, left: Float, right: Float) throws -> URL {

        let url = FileManager.default.temporaryDirectory.appendingPathComponent("live-text-preview-\(UUID().uuidString).caf")
        let format = AVAudioFormat(standardFormatWithSampleRate: 16_000, channels: 2)!
        let frames = AVAudioFrameCount(seconds * 16_000)
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames)!
        buffer.frameLength = frames
        for index in 0..<Int(frames) {
            buffer.floatChannelData![0][index] = left
            buffer.floatChannelData![1][index] = right
        }
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        try file.write(from: buffer)
        return url
    }
}
