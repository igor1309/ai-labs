import Foundation

public enum AccessEvidence: Equatable, Sendable {
    case heard, silent, refused
}

public struct AccessState: Equatable, Sendable {
    public var evidence: AccessEvidence?
    public var device: UInt32?
    public var measuredAt: Double?
    public var available = false
    public var recording = false
    public var generation: UInt64 = 0
    public var probing: UInt64?
    public var waiting: Set<UUID> = []
    public var answers: [UUID: Bool] = [:]

    public init() {}

    public func fresh(at now: Double, device: UInt32?) -> Bool {
        guard evidence == .heard, let measuredAt, let device, device != 0, self.device == device else { return false }
        return now >= measuredAt && now - measuredAt < 30
    }
}

public enum AccessEvent: Equatable, Sendable {
    case refresh(UUID, now: Double, device: UInt32?)
    case measured(generation: UInt64, AccessEvidence, device: UInt32?, at: Double)
    case invalidated
    case expired(UInt64)
    case recording(Bool, UUID, now: Double, device: UInt32?)
    case acknowledged(UUID)
}

public enum AccessEffect: Equatable, Sendable {
    case probe(UInt64)
    case expire(UInt64, at: Double)
}

public enum AccessReducer {
    public static func reduce(_ state: AccessState, _ event: AccessEvent) -> (AccessState, AccessEffect?) {
        var state = state
        switch event {
        case let .refresh(id, now, device):
            if state.probing != nil, state.device != device {
                state.generation += 1
                state.evidence = nil
                state.device = device
            }
            state.available = state.fresh(at: now, device: device)
            if state.available || state.recording {
                state.answers[id] = state.available
            } else if let device, device != 0 {
                state.waiting.insert(id)
                if state.probing == nil {
                    state.generation += 1
                    state.probing = state.generation
                    state.device = device
                    return (state, .probe(state.generation))
                }
            } else {
                state.evidence = nil
                state.answers[id] = false
            }
        case let .measured(generation, evidence, device, at):
            guard state.probing == generation else { return (state, nil) }
            state.probing = nil
            if generation == state.generation, let device, device != 0, device == state.device, at.isFinite {
                state.evidence = evidence
                state.measuredAt = at
                state.available = evidence == .heard
            } else { state.available = false }
            for id in state.waiting { state.answers[id] = state.available }
            state.waiting.removeAll()
            return (state, state.available ? .expire(state.generation, at: at + 30) : nil)
        case .invalidated:
            state.generation += 1
            state.evidence = nil
            state.measuredAt = nil
            state.available = false
        case let .expired(generation):
            if generation == state.generation { state.available = false; state.evidence = nil }
        case let .recording(running, id, now, device):
            // The caller joins refresh before reserving the recording interval.
            if running { state.available = state.fresh(at: now, device: device) }
            guard !running || (state.probing == nil && state.available) else {
                state.answers[id] = false; return (state, nil)
            }
            state.recording = running
            state.answers[id] = true
        case let .acknowledged(id): state.answers.removeValue(forKey: id)
        }
        return (state, nil)
    }
}

public struct AccessEffectHandler: Sendable {
    private let probe: @Sendable () async -> AccessEvidence
    private let device: @Sendable () async -> UInt32?
    private let now: @Sendable () -> Double
    private let sleep: @Sendable (Duration) async throws -> Void

    public init(probe: @escaping @Sendable () async -> AccessEvidence,
                device: @escaping @Sendable () async -> UInt32?, now: @escaping @Sendable () -> Double,
                sleep: @escaping @Sendable (Duration) async throws -> Void) {
        self.probe = probe; self.device = device; self.now = now; self.sleep = sleep
    }

    public func handle(_ effect: AccessEffect) async -> AccessEvent? {
        switch effect {
        case let .probe(generation):
            let before = await device()
            let evidence = await probe()
            let completedAt = now()
            let after = await device()
            return .measured(generation: generation, before == after ? evidence : .refused, device: after, at: completedAt)
        case let .expire(generation, at):
            do { try await sleep(.seconds(max(0, at - now()))); return .expired(generation) }
            catch { return nil }
        }
    }
}

/// An awaitable port to the application's model. It owns no reducer loop.
public struct AccessPolicy: Sendable {
    public let states: @Sendable () async -> AsyncStream<AccessState>
    private let send: @Sendable (AccessEvent) async -> Void
    private let device: @Sendable () async -> UInt32?
    private let now: @Sendable () -> Double

    public init(send: @escaping @Sendable (AccessEvent) async -> Void,
                states: @escaping @Sendable () async -> AsyncStream<AccessState>,
                device: @escaping @Sendable () async -> UInt32?, now: @escaping @Sendable () -> Double) {
        self.send = send; self.states = states; self.device = device; self.now = now
    }

    public func refresh() async -> Bool {
        let id = UUID()
        let output = await device()
        return await request(.refresh(id, now: now(), device: output), id: id)
    }

    @discardableResult
    public func recording(_ running: Bool) async -> Bool {
        let id = UUID()
        let output = running ? await device() : nil
        return await request(.recording(running, id, now: now(), device: output), id: id)
    }

    public func invalidate() async { await send(.invalidated) }

    /// The caller serializes recording delivery. Session's ended report is its cleanup boundary.
    public func transition(ended: Bool, mayStart: Bool,
                           refreshConditions: @Sendable (Bool) async -> Void,
                           unavailable: @Sendable () async -> Void,
                           deliver: @Sendable () async -> Bool) async {
        if ended { await recording(false) }
        if mayStart {
            await refreshConditions(refresh())
            if !(await recording(true)) { await unavailable() }
        }
        await recording(deliver())
    }

    private func request(_ event: AccessEvent, id: UUID) async -> Bool {
        let updates = await states()
        await send(event)
        for await state in updates {
            if let answer = state.answers[id] {
                await send(.acknowledged(id))
                return answer
            }
        }
        return false
    }
}
