import Foundation
import Synchronization

/// Captures the default microphone without voice processing. Stop is
/// idempotent; the stream ends after all callbacks in flight have delivered.
public final class MicrophoneCapture: Sendable {

    public let audio: AsyncThrowingStream<AudioPiece, any Error>

    private let lifetime: CaptureLifetime

    /// Captures through `hardware`: `.system()` in the app.
    public init(hardware: MicrophoneHardware) async throws {

        let binding = hardware.binding
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

/// Lifecycle state belongs to the actor. Native callbacks post messages to its
/// mailbox in the order they arrive; the audio callback touches only delivery,
/// so native stop can wait for it without holding the delivery lock.
private actor CaptureLifetime {

    private enum Message: Sendable {
        case defaultChanged(UInt32, at: Double)
        case configurationChanged(generation: Int)
        case settleReached(DeviceFollowing.Settle)
        case failed(any Error)
        case delivering
        case stop
        case barrier(CheckedContinuation<Void, Never>)
    }

    private let binding: any MicrophoneBinding
    private nonisolated let mailbox: AsyncStream<Message>.Continuation
    private nonisolated let delivery: DeliveryBox
    private var ended = false
    private var following = DeviceFollowing(input: 0)
    private var generation = 0
    private var cancelSettle: (@Sendable () -> Void)?

    init(binding: any MicrophoneBinding, continuation: AsyncThrowingStream<AudioPiece, any Error>.Continuation) {

        self.binding = binding
        delivery = DeliveryBox(Delivery(continuation: continuation))
        let messages = AsyncStream<Message>.makeStream()
        mailbox = messages.continuation
        Task { await self.run(messages.stream) }
    }

    private func run(_ messages: AsyncStream<Message>) async {

        for await message in messages { process(message) }
    }

    func start() throws {

        do {
            let post = mailbox
            try binding.watchDefaultInput { [binding] input in
                post.yield(.defaultChanged(input, at: binding.now))
            }
            following = DeviceFollowing(input: try binding.defaultInput())
            delivery.state.withLock { $0.lastEnd = binding.now }
            try startEngine(input: following.input)
        } catch {
            finish(error)
            throw error
        }
    }

    nonisolated func stop() {

        mailbox.yield(.stop)
    }

    /// Returns once every message posted before it has been handled.
    func synchronize() async {

        await withCheckedContinuation { done in
            if case .terminated = mailbox.yield(.barrier(done)) { done.resume() }
        }
    }

    private func process(_ message: Message) {

        switch message {
        case let .defaultChanged(input, time):
            handle(.defaultChanged(input == 0 ? nil : input, at: time))
        case let .configurationChanged(startedGeneration):
            guard !ended, generation == startedGeneration else { return }
            do {
                let latest = try readDefault()
                handle(.configurationChanged(
                    currentAvailable: binding.inputAvailable(following.input), defaultInput: latest
                ))
            } catch { finish(error) }
        case let .settleReached(settle):
            guard !ended, following.pending == settle else { return }
            do {
                handle(.defaultChanged(try readDefault(), at: binding.now))
                handle(.settleReached(settle, at: binding.now))
            } catch { finish(error) }
        case let .failed(error):
            finish(error)
        case .delivering:
            handle(.currentInputDelivering)
        case .stop:
            finish(nil)
        case let .barrier(done):
            done.resume()
        }
    }

    private func startEngine(input: UInt32) throws {

        guard input != 0 else { throw CaptureError.noInput }
        generation += 1
        let startedGeneration = generation
        let post = mailbox
        let delivery = delivery
        try binding.start(input: input, receive: { result in
            Self.receive(result, delivery: delivery, post: post)
        }) {
            post.yield(.configurationChanged(generation: startedGeneration))
        }
    }

    private func readDefault() throws -> UInt32? {

        do { return try binding.defaultInput() }
        catch CaptureError.noInput { return nil }
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
                let post = mailbox
                cancelSettle = binding.schedule(at: settle.deadline) { post.yield(.settleReached(settle)) }
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
        delivery.state.withLock {
            $0.finished = true
            $0.continuation.finish(throwing: $0.error ?? error)
        }
        // Messages already posted still drain; the run loop then ends.
        mailbox.finish()
    }

    private static func receive(
        _ result: Result<InputBuffer, any Error>,
        delivery: DeliveryBox,
        post: AsyncStream<Message>.Continuation
    ) {

        let failure: (any Error)? = delivery.state.withLock { state in
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
        if let failure { post.yield(.failed(failure)) } else { post.yield(.delivering) }
    }
}

private final class DeliveryBox: Sendable {

    let state: Mutex<Delivery>

    init(_ delivery: Delivery) { state = Mutex(delivery) }
}

private struct Delivery {

    let continuation: AsyncThrowingStream<AudioPiece, any Error>.Continuation
    var lastEnd = 0.0
    var finished = false
    var error: (any Error)?
}
