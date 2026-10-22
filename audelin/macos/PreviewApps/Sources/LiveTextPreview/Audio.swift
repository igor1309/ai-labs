import AVFoundation
import LiveText

/// The default input device, in chunks as the engine delivers them, first
/// channel only.
final class Microphone: AudioSource, @unchecked Sendable {

    private let engine = AVAudioEngine()

    func audio() -> AsyncStream<AudioChunk> {

        let (stream, continuation) = AsyncStream<AudioChunk>.makeStream()
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        input.installTap(onBus: 0, bufferSize: AVAudioFrameCount(format.sampleRate / 10), format: format) { buffer, _ in
            guard let data = buffer.floatChannelData?[0] else { return }
            let samples = Array(UnsafeBufferPointer(start: data, count: Int(buffer.frameLength)))
            continuation.yield(AudioChunk(samples: samples, sampleRate: format.sampleRate))
        }
        continuation.onTermination = { _ in self.end() }
        do {
            try engine.start()
        } catch {
            continuation.finish()
        }
        return stream
    }

    private func end() {

        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
    }
}

/// One channel of a recorded file in 0.1 s chunks, at the pace it was
/// spoken.
struct RecordedTrack: AudioSource, @unchecked Sendable {

    let url: URL
    let channel: Int
    let started: ContinuousClock.Instant

    func audio() -> AsyncStream<AudioChunk> {

        guard let file = try? AVAudioFile(forReading: url) else { return AsyncStream { nil } }
        let format = file.processingFormat
        let block = AVAudioFrameCount(format.sampleRate / 10)
        let channel = min(channel, Int(format.channelCount) - 1)
        let started = started
        var fed = 0.0
        return AsyncStream {
            guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: block),
                  (try? file.read(into: buffer, frameCount: block)) != nil,
                  buffer.frameLength > 0,
                  let data = buffer.floatChannelData?[channel] else { return nil }
            fed += Double(buffer.frameLength) / format.sampleRate
            do { try await Task.sleep(until: started + .seconds(fed)) } catch { return nil }
            return AudioChunk(samples: Array(UnsafeBufferPointer(start: data, count: Int(buffer.frameLength))), sampleRate: format.sampleRate)
        }
    }

    static func channels(of url: URL) throws -> Int {

        Int(try AVAudioFile(forReading: url).processingFormat.channelCount)
    }
}
