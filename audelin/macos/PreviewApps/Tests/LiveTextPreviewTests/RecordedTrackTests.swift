import AVFoundation
import Foundation
import LiveText
import Testing
@testable import LiveTextPreview

struct RecordedTrackTests {

    @Test(arguments: [0, 1])
    func aTrackIsReadOneChannelAtItsPace(channel: Int) async throws {

        let url = try stereo(seconds: 0.3, left: 0.25, right: -0.5)
        defer { try? FileManager.default.removeItem(at: url) }
        let started = ContinuousClock.now

        var chunks: [AudioChunk] = []
        for await chunk in RecordedTrack(url: url, channel: channel, started: started, sleep: { _ in }).audio() { chunks.append(chunk) }

        #expect(chunks.count == 3)
        let sample = channel == 0 ? Float(0.25) : -0.5
        #expect(chunks.allSatisfy { $0.samples.allSatisfy { $0 == sample } })
    }

    @Test func eachChunkWaitsForItsScheduledEmission() async throws {

        let url = try stereo(seconds: 0.3, left: 0.25, right: -0.5)
        defer { try? FileManager.default.removeItem(at: url) }
        let started = ContinuousClock.now
        let clock = SleepRecorder()

        var chunks: [AudioChunk] = []
        for await chunk in RecordedTrack(
            url: url,
            channel: 0,
            started: started,
            sleep: { instant in await clock.record(instant - started) }
        ).audio() {
            chunks.append(chunk)
        }

        #expect(chunks.count == 3)
        #expect(await clock.delays == [100, 200, 300])
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

private actor SleepRecorder {

    private(set) var delays: [Int64] = []

    func record(_ delay: Duration) {

        let components = delay.components
        delays.append(components.seconds * 1_000 + components.attoseconds / 1_000_000_000_000_000)
    }
}

struct MicrophoneTests {

    @Test func tapBuffersBecomeMonoChunksAndEndingStopsTheSource() async {

        let source = FakeMicrophoneSource()
        let microphone = Microphone(source: source)
        let stream = microphone.audio()
        var iterator = stream.makeAsyncIterator()
        source.emit([[0.1, 0.2], [0.9, 0.8]])
        source.emit([[0.3, 0.4], [0.7, 0.6]])

        let first = await iterator.next()
        let second = await iterator.next()
        microphone.end()

        #expect(first?.samples == [0.1, 0.2])
        #expect(second?.samples == [0.3, 0.4])
        #expect(first?.sampleRate == 16_000)
        #expect(source.stopCount == 1)
    }
}

private final class FakeMicrophoneSource: MicrophoneSource, @unchecked Sendable {

    let format = AVAudioFormat(standardFormatWithSampleRate: 16_000, channels: 2)!
    private var receive: (([[Float]], Double) -> Void)?
    private(set) var stopCount = 0

    func start(_ receive: @escaping ([[Float]], Double) -> Void) {

        self.receive = receive
    }

    func stop() {

        stopCount += 1
    }

    func emit(_ channels: [[Float]]) {

        receive?(channels, format.sampleRate)
    }
}
