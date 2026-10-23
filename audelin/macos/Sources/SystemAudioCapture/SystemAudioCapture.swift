import Foundation
import Synchronization

/// One capture. Naming changes the existing tap; stopping is idempotent.
public final class SystemAudioCapture: Sendable {

    public let audio: AsyncThrowingStream<AudioPiece, any Error>

    private let binding: any CaptureBinding
    private let lifecycle = NSRecursiveLock()
    private let delivery: Mutex<Delivery>
    private let resources = Mutex(Resources())
    private let cleanupQueue = DispatchQueue(label: "audelin.system-audio-cleanup")

    public init(binding: any CaptureBinding, processes: ProcessSelection) throws {

        self.binding = binding
        let stream = AsyncThrowingStream<AudioPiece, any Error>.makeStream()
        audio = stream.stream
        delivery = Mutex(Delivery(continuation: stream.continuation))
        stream.continuation.onTermination = { [weak self] termination in
            if case .cancelled = termination { self?.scheduleStop() }
        }
        lifecycle.lock()
        defer { lifecycle.unlock() }
        do {
            let tap = try binding.createTap(Self.request(processes))
            resources.withLock { $0.tap = tap }
            let device = try binding.createDevice(DeviceRequest(tap: tap, isPrivate: true, autoStart: false))
            resources.withLock { $0.device = device }
            guard try binding.sampleRate(tap) > 0 else { throw CaptureError.unsupportedFormat }
            let io = try binding.installIO(device) { [weak self] in self?.receive($0, tap: tap) }
            resources.withLock { $0.io = io }
            let watch = try binding.watchDevice(device) { [weak self] in self?.fail(CaptureError.deviceStopped) }
            resources.withLock { $0.watch = watch }
            try binding.startDevice(device, io)
            resources.withLock { $0.started = true }
        } catch {
            release()
            finish(error)
            throw error
        }
    }

    public func name(_ processes: ProcessSelection) throws {

        lifecycle.lock()
        defer { lifecycle.unlock() }
        guard !delivery.withLock({ $0.ended }), let tap = resources.withLock({ $0.tap }) else {
            throw CaptureError.stopped
        }
        try binding.updateTap(tap, Self.request(processes))
    }

    public func stop() {

        lifecycle.lock()
        defer { lifecycle.unlock() }
        delivery.withLock { $0.stopping = true }
        // Stop IO before finishing so buffers already being delivered are kept.
        release()
        finish(nil)
    }

    deinit {

        release()
        finish(nil)
    }

    private static func request(_ processes: ProcessSelection) -> TapRequest {

        TapRequest(selection: processes, mono: true, unmuted: true, isPrivate: true)
    }

    private func receive(_ samples: [Float], tap: UInt32) {

        let failed = delivery.withLock { state -> Bool in
            guard !state.ended else { return false }
            do {
                // The tap's format can change with the output route.
                let rate = try binding.sampleRate(tap)
                guard rate > 0 else { throw CaptureError.unsupportedFormat }
                state.continuation.yield(AudioPiece(samples: samples, sampleRate: rate))
                return false
            } catch {
                state.ended = true
                state.continuation.finish(throwing: error)
                return true
            }
        }
        if failed { scheduleStop() }
    }

    private func finish(_ error: (any Error)?) {

        delivery.withLock {
            guard !$0.ended else { return }
            $0.ended = true
            $0.continuation.finish(throwing: error)
        }
    }

    private func fail(_ error: any Error) {

        let failed = delivery.withLock {
            guard !$0.ended, !$0.stopping else { return false }
            $0.ended = true
            $0.continuation.finish(throwing: error)
            return true
        }
        if failed { scheduleStop() }
    }

    private func scheduleStop() {

        // Native stop can wait for IO or a listener that raised the failure.
        cleanupQueue.async { [self] in stop() }
    }

    private func release() {

        let made = resources.withLock {
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
    }
}

private struct Delivery {

    let continuation: AsyncThrowingStream<AudioPiece, any Error>.Continuation
    var ended = false
    var stopping = false
}

private struct Resources {

    var tap: UInt32?
    var device: UInt32?
    var io: UInt64?
    var watch: UInt64?
    var started = false
}
