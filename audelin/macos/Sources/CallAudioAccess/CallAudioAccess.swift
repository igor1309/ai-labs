import Foundation
import Synchronization

public enum AccessEvidence: Equatable, Sendable {
    case heard, silent, refused
}

public struct AccessState: Equatable, Sendable {
    public enum Phase: Equatable, Sendable {
        case idle
        case probing(generation: UInt64, device: UInt32)
    }

    public var evidence: AccessEvidence?
    public var measuredAt: Double?
    public var device: UInt32?
    public var generation: UInt64 = 0
    public var recording = false
    public var phase: Phase = .idle
    public var ready = false
    public var published: Bool { evidence == .heard }

    public init() {}

    public func fresh(at now: Double, device: UInt32?) -> Bool {
        guard evidence == .heard, let measuredAt, measuredAt.isFinite, now.isFinite,
              let device, device != 0, self.device == device else { return false }
        let age = now - measuredAt
        return age >= 0 && age < 30
    }
}

public enum AccessEvent: Equatable, Sendable {
    case refresh(now: Double, device: UInt32?)
    case measured(generation: UInt64, evidence: AccessEvidence, device: UInt32?, at: Double)
    case invalidated
    case expired(generation: UInt64)
    case recording(Bool, now: Double, device: UInt32?)
}

public enum AccessReducer {
    public static func reduce(_ state: AccessState, _ event: AccessEvent) -> AccessState {
        var state = state
        func invalidate() {
            state.generation += 1
            state.evidence = nil
            state.measuredAt = nil
            state.ready = false
        }
        switch event {
        case let .refresh(now, device):
            if state.device != device { invalidate(); state.device = device }
            state.ready = state.phase == .idle && state.fresh(at: now, device: device)
            guard !state.recording, state.phase == .idle, !state.ready,
                  let device, device != 0 else { return state }
            state.generation += 1
            state.phase = .probing(generation: state.generation, device: device)
        case let .measured(generation, evidence, device, at):
            guard case let .probing(active, output) = state.phase, active == generation else { return state }
            state.phase = .idle
            state.evidence = nil
            state.measuredAt = nil
            state.ready = false
            guard generation == state.generation, device == output, at.isFinite else { return state }
            state.evidence = evidence
            state.device = device
            state.measuredAt = at
            state.ready = evidence == .heard
        case .invalidated:
            invalidate()
        case let .expired(generation):
            if generation == state.generation { state.ready = false }
        case let .recording(running, now, device):
            if !running { state.recording = false; return state }
            if state.device != device { invalidate(); state.device = device }
            state.ready = state.phase == .idle && state.fresh(at: now, device: device)
            if !state.recording && state.ready { state.recording = true }
        }
        return state
    }
}

/// Observing a phase more than once must not repeat its work.
public final class AccessDoer: Sendable {
    private struct Memory {
        var probe: UInt64?
        var expiry: UInt64?
        var probeTask: Task<Void, Never>?
        var expiryTask: Task<Void, Never>?
        var ended = false
    }
    private let memory = Mutex(Memory())
    private let probe: @Sendable () async -> AccessEvidence
    private let device: @Sendable () async -> UInt32?
    private let now: @Sendable () -> Double
    private let sleep: @Sendable (Duration) async throws -> Void
    private let send: @Sendable (AccessEvent) async -> Void

    public init(probe: @escaping @Sendable () async -> AccessEvidence,
                device: @escaping @Sendable () async -> UInt32?, now: @escaping @Sendable () -> Double,
                sleep: @escaping @Sendable (Duration) async throws -> Void,
                send: @escaping @Sendable (AccessEvent) async -> Void) {
        self.probe = probe; self.device = device; self.now = now; self.sleep = sleep; self.send = send
    }

    public func act(on state: AccessState) {
        memory.withLock { memory in
            guard !memory.ended else { return }
            if case let .probing(generation, output) = state.phase,
               memory.probe == nil || generation > memory.probe! {
                memory.probe = generation
                memory.probeTask = Task { [probe, device, now, send] in
                    let before = await device()
                    let evidence = await probe()
                    let after = await device()
                    let at = now()
                    await send(.measured(generation: generation,
                        evidence: before == output && after == output ? evidence : .refused,
                        device: after, at: at))
                }
            }
            if state.phase == .idle, state.ready, state.evidence == .heard, let at = state.measuredAt,
               memory.expiry == nil || state.generation > memory.expiry! {
                let generation = state.generation
                memory.expiry = generation
                memory.expiryTask?.cancel()
                memory.expiryTask = Task { [sleep, now, send] in
                    do {
                        try await sleep(.seconds(max(0, at + 30 - now())))
                        guard !Task.isCancelled else { return }
                        await send(.expired(generation: generation))
                    } catch {}
                }
            }
        }
    }

    public func end() {
        let tasks = memory.withLock { memory in
            memory.ended = true
            defer { memory.probeTask = nil; memory.expiryTask = nil }
            return [memory.probeTask, memory.expiryTask].compactMap { $0 }
        }
        for task in tasks { task.cancel() }
    }

    deinit { end() }
}

/// The app supplies transactions on its model's actor.
public struct AccessPolicy: Sendable {
    public let refresh: @Sendable () async -> Bool
    public let reserve: @Sendable () async -> Bool
    public let release: @Sendable () async -> Void
    public let states: @Sendable () async -> AsyncStream<AccessState>
    public let invalidate: @Sendable () async -> Void

    public init(refresh: @escaping @Sendable () async -> Bool,
                reserve: @escaping @Sendable () async -> Bool,
                release: @escaping @Sendable () async -> Void,
                states: @escaping @Sendable () async -> AsyncStream<AccessState>,
                invalidate: @escaping @Sendable () async -> Void) {
        self.refresh = refresh; self.reserve = reserve; self.release = release
        self.states = states; self.invalidate = invalidate
    }
}
