import Foundation
import Synchronization

/// One capture. Naming changes the existing tap; stopping is idempotent.
public final class SystemAudioCapture: Sendable {

    public let audio: AsyncThrowingStream<AudioPiece, any Error>

    private let lifetime: CaptureLifetime

    public init(binding: any CaptureBinding, processes: ProcessSelection) async throws {

        let stream = AsyncThrowingStream<AudioPiece, any Error>.makeStream()
        audio = stream.stream
        let lifetime = CaptureLifetime(binding: binding, continuation: stream.continuation)
        self.lifetime = lifetime
        stream.continuation.onTermination = { [weak lifetime] termination in
            if case .cancelled = termination { lifetime?.end(nil) }
        }
        do {
            try await lifetime.start(processes)
        } catch {
            lifetime.end(error)
            await lifetime.cleanup()
            throw error
        }
    }

    public func name(_ processes: ProcessSelection) async throws {

        try await lifetime.name(processes)
    }

    public func stop() {

        lifetime.end(nil)
    }

    deinit {

        lifetime.end(nil)
    }
}

/// Callbacks and cleanup outlive the capture without retaining its owner.
/// Setup, naming and removal take turns on the actor. Ending may be requested
/// from a native callback before setup has run, so cleanup can run more than
/// once and setup cleans up after itself when the capture ended meanwhile.
/// The actor runs on its own queue: native calls block (removal waits for IO
/// in flight), and blocking the few shared concurrency threads stalls every
/// other task in the process.
private actor CaptureLifetime {

    private let binding: any CaptureBinding
    private nonisolated let queue = DispatchSerialQueue(label: "audelin.capture.lifetime")
    nonisolated var unownedExecutor: UnownedSerialExecutor { queue.asUnownedSerialExecutor() }
    private nonisolated let state: CaptureState

    init(binding: any CaptureBinding, continuation: AsyncThrowingStream<AudioPiece, any Error>.Continuation) {

        self.binding = binding
        state = CaptureState(continuation: continuation)
    }

    func start(_ processes: ProcessSelection) throws {

        defer { if state.delivery.withLock({ $0.ending }) { cleanup() } }
        guard !state.delivery.withLock({ $0.ending }) else { throw CaptureError.stopped }
        let tap = try binding.createTap(Self.request(processes))
        state.resources.withLock { $0.tap = tap }
        let device = try binding.createDevice(DeviceRequest(tap: tap, isPrivate: true, autoStart: false))
        state.resources.withLock { $0.device = device }
        guard try binding.sampleRate(tap) > 0 else { throw CaptureError.unsupportedFormat }
        let io = try binding.installIO(device) { [self] in receive($0) }
        state.resources.withLock { $0.io = io }
        let watch = try binding.watchDevice(device) { [self] in end(CaptureError.deviceStopped) }
        state.resources.withLock { $0.watch = watch }
        try binding.startDevice(device, io)
        state.resources.withLock { $0.started = true }
    }

    func name(_ processes: ProcessSelection) throws {

        guard !state.delivery.withLock({ $0.ending }), let tap = state.resources.withLock({ $0.tap }) else {
            throw CaptureError.stopped
        }
        try binding.updateTap(tap, Self.request(processes))
    }

    nonisolated func end(_ error: (any Error)?) {

        let first = state.delivery.withLock {
            guard !$0.ending else { return false }
            $0.ending = true
            $0.error = error
            return true
        }
        guard first else { return }
        // Never inline: native removal waits for IO, and this may be an IO callback.
        // The task hops to the actor's own queue, off the shared threads.
        Task { await cleanup() }
    }

    /// Releases what setup made so far and ends the stream. Native removal can
    /// wait for IO already in flight; that IO finishes on its own.
    func cleanup() {

        let made = state.resources.withLock {
            let made = $0
            $0 = Resources()
            return made
        }
        if let device = made.device {
            if made.started, let io = made.io { binding.stopDevice(device, io) }
            if let watch = made.watch { binding.unwatchDevice(device, watch) }
            if let io = made.io { binding.removeIO(device, io) }
            binding.destroyDevice(device)
        }
        if let tap = made.tap { binding.destroyTap(tap) }
        state.delivery.withLock {
            guard !$0.finished else { return }
            $0.finished = true
            $0.continuation.finish(throwing: $0.error)
        }
    }

    private static func request(_ processes: ProcessSelection) -> TapRequest {

        TapRequest(selection: processes, mono: true, unmuted: true, isPrivate: true)
    }

    private nonisolated func receive(_ buffer: Result<AudioPiece, any Error>) {

        do {
            let piece = try buffer.get()
            guard piece.sampleRate > 0 else { throw CaptureError.unsupportedFormat }
            state.delivery.withLock {
                guard !$0.finished else { return }
                $0.continuation.yield(piece)
            }
        } catch {
            end(error)
        }
    }
}

private final class CaptureState: Sendable {

    let delivery: Mutex<Delivery>
    let resources = Mutex(Resources())

    init(continuation: AsyncThrowingStream<AudioPiece, any Error>.Continuation) {

        delivery = Mutex(Delivery(continuation: continuation))
    }
}

private struct Delivery {

    let continuation: AsyncThrowingStream<AudioPiece, any Error>.Continuation
    var ending = false
    var finished = false
    var error: (any Error)?
}

private struct Resources {

    var tap: UInt32?
    var device: UInt32?
    var io: UInt64?
    var watch: UInt64?
    var started = false
}
