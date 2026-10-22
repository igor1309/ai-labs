import AVFoundation
import LiveText

/// The default input device, in chunks as the engine delivers them, first
/// channel only.
final class Microphone: AudioSource, @unchecked Sendable {

    private let source: any MicrophoneSource
    private let endLock = NSLock()
    private var isEnded = false

    init(source: any MicrophoneSource) {

        self.source = source
    }

    func audio() -> AsyncStream<AudioChunk> {

        let (stream, continuation) = AsyncStream<AudioChunk>.makeStream()
        let format = source.format
        Log.line("microphone: access \(Self.access), \(format.sampleRate) Hz, \(format.channelCount) channel(s)")
        continuation.onTermination = { _ in self.end() }
        do {
            try source.start { channels, sampleRate in
                guard let samples = channels.first else { return }
                continuation.yield(AudioChunk(samples: samples, sampleRate: sampleRate))
            }
        } catch {
            Log.line("microphone: failed to start: \(error)")
            continuation.finish()
            return stream
        }
        Log.line("microphone: started")
        return stream
    }

    func end() {

        endLock.lock()
        let wasEnded = isEnded
        isEnded = true
        endLock.unlock()
        guard !wasEnded else { return }
        source.stop()
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

protocol MicrophoneSource {

    var format: AVAudioFormat { get }
    func start(_ receive: @escaping ([[Float]], Double) -> Void) throws
    func stop()
}

final class EngineMicrophoneSource: MicrophoneSource {

    private let engine = AVAudioEngine()

    var format: AVAudioFormat {

        engine.inputNode.outputFormat(forBus: 0)
    }

    func start(_ receive: @escaping ([[Float]], Double) -> Void) throws {

        let input = engine.inputNode
        let format = self.format
        input.installTap(onBus: 0, bufferSize: AVAudioFrameCount(format.sampleRate / 10), format: format) { buffer, _ in
            let channels = (0..<Int(buffer.format.channelCount)).compactMap { channel -> [Float]? in
                guard let data = buffer.floatChannelData?[channel] else { return nil }
                return Array(UnsafeBufferPointer(start: data, count: Int(buffer.frameLength)))
            }
            receive(channels, format.sampleRate)
        }
        do {
            try engine.start()
        } catch {
            input.removeTap(onBus: 0)
            throw error
        }
    }

    func stop() {

        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
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
    let sleep: @Sendable (ContinuousClock.Instant) async throws -> Void

    init(
        url: URL,
        channel: Int,
        started: ContinuousClock.Instant,
        sleep: @escaping @Sendable (ContinuousClock.Instant) async throws -> Void = { try await Task.sleep(until: $0) }
    ) {

        self.url = url
        self.channel = channel
        self.started = started
        self.sleep = sleep
    }

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
            do { try await sleep(started + .seconds(fed)) } catch { return nil }
            return AudioChunk(samples: Array(UnsafeBufferPointer(start: data, count: Int(buffer.frameLength))), sampleRate: format.sampleRate)
        }
    }

    static func channels(of url: URL) throws -> Int {

        Int(try AVAudioFile(forReading: url).processingFormat.channelCount)
    }
}
