import AVFoundation
import LiveText

/// The default input device, in chunks as the engine delivers them, first
/// channel only.
final class Microphone: AudioSource, @unchecked Sendable {

    private let engine = AVAudioEngine()
    private let endLock = NSLock()
    private var isEnded = false

    func audio() -> AsyncStream<AudioChunk> {

        let (stream, continuation) = AsyncStream<AudioChunk>.makeStream()
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        Log.line("microphone: access \(Self.access), \(format.sampleRate) Hz, \(format.channelCount) channel(s)")
        input.installTap(onBus: 0, bufferSize: AVAudioFrameCount(format.sampleRate / 10), format: format) { buffer, _ in
            guard let data = buffer.floatChannelData?[0] else { return }
            let samples = Array(UnsafeBufferPointer(start: data, count: Int(buffer.frameLength)))
            continuation.yield(AudioChunk(samples: samples, sampleRate: format.sampleRate))
        }
        continuation.onTermination = { _ in self.end() }
        do {
            try engine.start()
            Log.line("microphone: started")
        } catch {
            Log.line("microphone: failed to start: \(error)")
            continuation.finish()
        }
        return stream
    }

    func end() {

        endLock.lock()
        let wasEnded = isEnded
        isEnded = true
        endLock.unlock()
        guard !wasEnded else { return }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        Log.line("microphone: stopped")
    }

    private static var access: String {

        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized: "granted"
        case .denied: "denied: allow the terminal in System Settings › Privacy & Security › Microphone"
        case .restricted: "restricted"
        case .notDetermined: "not asked yet"
        @unknown default: "unknown"
        }
    }

    /// Asks for microphone access if it was never asked, and says whether
    /// it is granted.
    static func requestAccess() async -> Bool {

        if AVCaptureDevice.authorizationStatus(for: .audio) == .notDetermined {
            Log.line("microphone: asking for access")
            _ = await AVCaptureDevice.requestAccess(for: .audio)
        }
        Log.line("microphone: access \(access)")
        return AVCaptureDevice.authorizationStatus(for: .audio) == .authorized
    }
}

/// Audio already started, handed to Live text when it is ready to listen.
struct Started: AudioSource {

    let stream: AsyncStream<AudioChunk>

    init(_ stream: AsyncStream<AudioChunk>) { self.stream = stream }

    func audio() -> AsyncStream<AudioChunk> { stream }
}

/// One channel of a recorded file in 0.1 s chunks, at the pace it was
/// spoken.
struct RecordedTrack: AudioSource, @unchecked Sendable {

    let url: URL
    let channel: Int
    let started: ContinuousClock.Instant

    func audio() -> AsyncStream<AudioChunk> {

        guard let file = try? AVAudioFile(forReading: url) else {
            Log.line("recording: cannot read \(url.path)")
            return AsyncStream { nil }
        }
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
