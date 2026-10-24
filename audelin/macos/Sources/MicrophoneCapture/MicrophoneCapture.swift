import Foundation
import Synchronization

/// Captures the default microphone without voice processing. Stop is
/// idempotent; the stream ends after all callbacks in flight have delivered.
public final class MicrophoneCapture: Sendable {

    public let audio: AsyncThrowingStream<AudioPiece, any Error>

    private let lifetime: CaptureLifetime

    public convenience init() throws {

        try self.init(binding: NativeMicrophoneBinding())
    }

    init(binding: any MicrophoneBinding) throws {

        let stream = AsyncThrowingStream<AudioPiece, any Error>.makeStream()
        audio = stream.stream
        lifetime = CaptureLifetime(binding: binding, continuation: stream.continuation)
        stream.continuation.onTermination = { [weak lifetime] termination in
            if case .cancelled = termination { lifetime?.stop() }
        }
        try lifetime.start()
    }

    public func stop() {

        lifetime.stop()
    }

    /// A completion barrier for lifecycle work already submitted by a binding.
    func synchronize() async {

        await lifetime.synchronize()
    }

    deinit {

        lifetime.stop()
    }
}

// Lifecycle state belongs to queue; the audio callback touches only delivery.
// Native stop can wait for that callback without holding its delivery lock.
private final class CaptureLifetime: @unchecked Sendable {

    private let binding: any MicrophoneBinding
    private let queue = DispatchQueue(label: "audelin.microphone-capture")
    private let delivery: Mutex<Delivery>
    private var ended = false
    private var currentInput: UInt32 = 0
    private var generation = 0
    private var settleVersion = 0
    private var pendingInput: UInt32?
    private var cancelSettle: (@Sendable () -> Void)?

    init(binding: any MicrophoneBinding, continuation: AsyncThrowingStream<AudioPiece, any Error>.Continuation) {

        self.binding = binding
        delivery = Mutex(Delivery(continuation: continuation))
    }

    func start() throws {

        try queue.sync {
            do {
                try binding.watchDefaultInput { [weak self] input in
                    guard let self else { return }
                    let time = binding.now
                    queue.async { [self] in defaultChanged(input, at: time) }
                }
                currentInput = try binding.defaultInput()
                delivery.withLock { $0.lastEnd = binding.now }
                try startEngine()
            } catch {
                finish(error)
                throw error
            }
        }
    }

    func stop() {

        queue.async { [self] in finish(nil) }
    }

    func synchronize() async {

        let signal = AsyncStream<Void>.makeStream()
        queue.async { signal.continuation.finish() }
        for await _ in signal.stream {}
    }

    private func startEngine() throws {

        guard currentInput != 0 else { throw CaptureError.noInput }
        generation += 1
        let startedGeneration = generation
        try binding.start(input: currentInput, receive: { [weak self] in self?.receive($0) }) { [weak self] in
            guard let self else { return }
            queue.async { [self] in
                guard !ended, generation == startedGeneration else { return }
                rebuild(input: currentInput)
            }
        }
    }

    private func defaultChanged(_ input: UInt32, at time: Double) {

        guard !ended else { return }
        if input == currentInput {
            clearSettle()
            return
        }
        guard pendingInput != input else { return }
        clearSettle()
        pendingInput = input
        let version = settleVersion
        cancelSettle = binding.schedule(at: time + 1.5) { [weak self] in
            guard let self else { return }
            queue.async { [self] in
                guard !ended, settleVersion == version else { return }
                do {
                    let latest = try binding.defaultInput()
                    if latest == input {
                        clearSettle()
                        rebuild(input: input)
                    } else {
                        defaultChanged(latest, at: binding.now)
                    }
                } catch { finish(error) }
            }
        }
    }

    private func clearSettle() {

        settleVersion += 1
        cancelSettle?()
        cancelSettle = nil
        pendingInput = nil
    }

    private func rebuild(input: UInt32) {

        binding.stop()
        do {
            currentInput = input
            try startEngine()
        } catch { finish(error) }
    }

    private func finish(_ error: (any Error)?) {

        guard !ended else { return }
        ended = true
        clearSettle()
        binding.unwatchDefaultInput()
        binding.stop()
        delivery.withLock {
            $0.finished = true
            $0.continuation.finish(throwing: $0.error ?? error)
        }
    }

    private func receive(_ result: Result<InputBuffer, any Error>) {

        let failure: (any Error)? = delivery.withLock { state in
            guard !state.finished, state.error == nil else { return nil }
            do {
                let buffer = try result.get()
                let rate = buffer.sampleRate
                guard rate.isFinite, rate > 0, buffer.time.isFinite,
                      let first = buffer.channels.first,
                      buffer.channels.allSatisfy({ $0.count == first.count }) else {
                    throw CaptureError.unsupportedFormat
                }
                guard !first.isEmpty else { return nil }
                var samples = [Float](repeating: 0, count: first.count)
                let divisor = Float(buffer.channels.count)
                for channel in buffer.channels {
                    for index in samples.indices { samples[index] += channel[index] / divisor }
                }
                let gap = max(0, buffer.time - state.lastEnd)
                guard gap <= 600 else { throw CaptureError.gapTooLong }
                let frames = (gap * rate).rounded()
                guard frames < Double(Int.max) else { throw CaptureError.unsupportedFormat }
                var remaining = Int(frames)
                while remaining > 0 {
                    let count = min(remaining, 16_384)
                    state.continuation.yield(AudioPiece(samples: Array(repeating: 0, count: count), sampleRate: rate))
                    remaining -= count
                }
                state.continuation.yield(AudioPiece(samples: samples, sampleRate: rate))
                state.lastEnd = buffer.time + Double(samples.count) / rate
                return nil
            } catch {
                state.error = error
                return error
            }
        }
        if let failure { queue.async { [self] in finish(failure) } }
    }
}

private struct Delivery {

    let continuation: AsyncThrowingStream<AudioPiece, any Error>.Continuation
    var lastEnd = 0.0
    var finished = false
    var error: (any Error)?
}
