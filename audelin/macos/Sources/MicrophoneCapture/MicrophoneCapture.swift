import Foundation
import Synchronization

/// Captures the default microphone without voice processing. Stop is
/// idempotent; the stream ends after all callbacks in flight have delivered.
public final class MicrophoneCapture: Sendable {

    public let audio: AsyncThrowingStream<AudioPiece, any Error>

    private let lifetime: CaptureLifetime

    public convenience init() async throws {

        try await self.init(binding: NativeMicrophoneBinding.system())
    }

    init(binding: any MicrophoneBinding) async throws {

        let stream = AsyncThrowingStream<AudioPiece, any Error>.makeStream()
        audio = stream.stream
        lifetime = CaptureLifetime(binding: binding, continuation: stream.continuation)
        stream.continuation.onTermination = { [weak lifetime] termination in
            if case .cancelled = termination { lifetime?.stop() }
        }
        try await lifetime.start()
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
    private var following = DeviceFollowing(input: 0)
    private var generation = 0
    private var cancelSettle: (@Sendable () -> Void)?

    init(binding: any MicrophoneBinding, continuation: AsyncThrowingStream<AudioPiece, any Error>.Continuation) {

        self.binding = binding
        delivery = Mutex(Delivery(continuation: continuation))
    }

    /// Starting the engine can block, so it runs on the capture's queue and
    /// the caller awaits it, never holding a pool thread.
    func start() async throws {

        try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, any Error>) in
            queue.async { [self] in done.resume(with: Result { try startOnQueue() }) }
        }
    }

    private func startOnQueue() throws {

        do {
            try binding.watchDefaultInput { [weak self] input in
                guard let self else { return }
                let time = binding.now
                queue.async { [self] in defaultChanged(input, at: time) }
            }
            following = DeviceFollowing(input: try binding.defaultInput())
            delivery.withLock { $0.lastEnd = binding.now }
            try startEngine(input: following.input)
        } catch {
            finish(error)
            throw error
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

    private func startEngine(input: UInt32) throws {

        guard input != 0 else { throw CaptureError.noInput }
        generation += 1
        let startedGeneration = generation
        try binding.start(input: input, receive: { [weak self] in self?.receive($0) }) { [weak self] in
            guard let self else { return }
            queue.async { [self] in
                guard !ended, generation == startedGeneration else { return }
                do {
                    let latest = try readDefault()
                    handle(.configurationChanged(
                        currentAvailable: binding.inputAvailable(following.input), defaultInput: latest
                    ))
                } catch { finish(error) }
            }
        }
    }

    private func readDefault() throws -> UInt32? {

        do { return try binding.defaultInput() }
        catch CaptureError.noInput { return nil }
    }

    private func defaultChanged(_ input: UInt32, at time: Double) {

        handle(.defaultChanged(input == 0 ? nil : input, at: time))
    }

    private func handle(_ event: DeviceFollowing.Event, failure: (any Error)? = nil) {

        guard !ended else { return }
        let previous = following.pending
        let result = following.transition(event)
        following = result.state
        if previous != following.pending {
            cancelSettle?()
            cancelSettle = nil
            if let settle = following.pending {
                cancelSettle = binding.schedule(at: settle.deadline) { [weak self] in
                    guard let self else { return }
                    queue.async { [self] in
                        guard !ended, following.pending == settle else { return }
                        do {
                            handle(.defaultChanged(try readDefault(), at: binding.now))
                            handle(.settleReached(settle, at: binding.now))
                        } catch { finish(error) }
                    }
                }
            }
        }
        switch result.action {
        case .none: break
        case let .rebuild(input): rebuild(input: input)
        case .fail: finish(failure ?? CaptureError.noInput)
        }
    }

    private func rebuild(input: UInt32) {

        binding.stop()
        do {
            try startEngine(input: input)
        } catch { handle(.rebuildRefused, failure: error) }
    }

    private func finish(_ error: (any Error)?) {

        guard !ended else { return }
        ended = true
        cancelSettle?()
        cancelSettle = nil
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
        if let failure {
            queue.async { [self] in finish(failure) }
        } else {
            queue.async { [self] in handle(.currentInputDelivering) }
        }
    }
}

private struct Delivery {

    let continuation: AsyncThrowingStream<AudioPiece, any Error>.Continuation
    var lastEnd = 0.0
    var finished = false
    var error: (any Error)?
}
