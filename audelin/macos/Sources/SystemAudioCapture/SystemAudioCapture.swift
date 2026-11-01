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
            await lifetime.drainCleanup()
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
/// Native setup, naming and removal can block, so they run in order on the
/// capture's own queue and callers await them, never holding a pool thread.
private final class CaptureLifetime: Sendable {

    private let binding: any CaptureBinding
    private let state: CaptureState
    private let queue = DispatchQueue(label: "audelin.system-audio-capture")

    init(binding: any CaptureBinding, continuation: AsyncThrowingStream<AudioPiece, any Error>.Continuation) {

        self.binding = binding
        state = CaptureState(continuation: continuation)
    }

    func start(_ processes: ProcessSelection) async throws {

        try await onQueue { [self] in try startOnQueue(processes) }
    }

    private func startOnQueue(_ processes: ProcessSelection) throws {

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

    func name(_ processes: ProcessSelection) async throws {

        try await onQueue { [self] in try nameOnQueue(processes) }
    }

    private func nameOnQueue(_ processes: ProcessSelection) throws {

        guard !state.delivery.withLock({ $0.ending }), let tap = state.resources.withLock({ $0.tap }) else {
            throw CaptureError.stopped
        }
        try binding.updateTap(tap, Self.request(processes))
    }

    func end(_ error: (any Error)?) {

        let first = state.delivery.withLock {
            guard !$0.ending else { return false }
            $0.ending = true
            $0.error = error
            return true
        }
        guard first else { return }
        // Detach behind construction and naming; native removal can wait for IO.
        // The job owns only cleanup state, never the capture being released.
        queue.async { [binding, state] in
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
                $0.finished = true
                $0.continuation.finish(throwing: $0.error)
            }
        }
    }

    func drainCleanup() async {

        await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in queue.async { done.resume() } }
    }

    private func onQueue(_ work: @escaping @Sendable () throws -> Void) async throws {

        try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, any Error>) in
            queue.async { done.resume(with: Result { try work() }) }
        }
    }

    private static func request(_ processes: ProcessSelection) -> TapRequest {

        TapRequest(selection: processes, mono: true, unmuted: true, isPrivate: true)
    }

    private func receive(_ buffer: Result<AudioPiece, any Error>) {

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
