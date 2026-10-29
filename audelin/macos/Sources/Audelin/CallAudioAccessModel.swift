import CallAudioAccess
import CallAudioProbe
import Foundation
import IMRxObservation

func makeCallAudioAccess() async -> AccessPolicy {
    let environment = OutputEnvironment()
    let probe = CallAudioProbe()
    let model = CallAudioAccessModel(device: { await environment.device() }, now: { ProcessInfo.processInfo.systemUptime })
    await model.start(probe: {
        switch await probe.measure() {
        case .heard: .heard
        case .silent: .silent
        case .refused: .refused
        }
    }, sleep: { try await ContinuousClock().sleep(for: $0) }, changes: environment.changes)
    return await model.policy()
}

/// Each request reduces and reads on this actor before waiting for its particular generation.
actor CallAudioAccessModel {
    private var model: SyncModel<AccessState, AccessEvent>?
    private var doer: AccessDoer?
    private let feed = StateFeed<AccessState>()
    private var changes: Task<Void, Never>?
    private let device: @Sendable () async -> UInt32?
    private let now: @Sendable () -> Double

    init(device: @escaping @Sendable () async -> UInt32?, now: @escaping @Sendable () -> Double) {
        self.device = device; self.now = now
    }

    func start(probe: @escaping @Sendable () async -> AccessEvidence,
               sleep: @escaping @Sendable (Duration) async throws -> Void, changes: AsyncStream<Void>) {
        guard model == nil, !feed.finished else { return }
        model = SyncModel(initialState: AccessState(), reduce: AccessReducer.reduce)
        doer = AccessDoer(probe: probe, device: device, now: now, sleep: sleep, send: { [weak self] in await self?.send($0) })
        self.changes = Task { [weak self] in
            for await _ in changes { await self?.send(.invalidated) }
        }
    }

    func policy() -> AccessPolicy {
        AccessPolicy(refresh: { await self.refresh() }, reserve: { await self.reserve() },
                     release: { await self.release() }, states: { await self.states() },
                     invalidate: { await self.send(.invalidated) })
    }

    func refresh() async -> Bool {
        guard model != nil, !feed.finished, !Task.isCancelled else { return false }
        let output = await device()
        return await prepareRefresh(now: now(), device: output).value()
    }

    /// Captures the answer or the completion stream in the same actor turn as the reduction.
    func prepareRefresh(now: Double, device: UInt32?) -> AccessRequest {
        guard !Task.isCancelled, let model, !feed.finished else { return .answered(false) }
        send(.refresh(now: now, device: device))
        let state = model.state
        if state.ready { return .answered(true) }
        guard case let .probing(generation, _) = state.phase,
              generation == state.generation else { return .answered(false) }
        return .probing(generation: generation, updates: states())
    }

    func reserve() async -> Bool {
        guard model != nil, !feed.finished, !Task.isCancelled else { return false }
        let output = await device()
        guard !Task.isCancelled, let model, !feed.finished, !model.state.recording else { return false }
        send(.recording(true, now: now(), device: output))
        return model.state.recording
    }

    func release() { send(.recording(false, now: now(), device: nil)) }

    func send(_ event: AccessEvent) {
        guard let model, !feed.finished else { return }
        let before = model.state
        model.event(event)
        if before != model.state { feed.publish(model.state) }
        doer?.act(on: model.state)
    }

    func states() -> AsyncStream<AccessState> { feed.subscribe(from: model?.state ?? .init()) }
    func end() { changes?.cancel(); changes = nil; feed.finish(); doer?.end(); doer = nil; model = nil }
    deinit { changes?.cancel(); doer?.end() }
}

/// A request follows one generation even when it is read after completion or supersession.
enum AccessRequest: Sendable {
    case answered(Bool)
    case probing(generation: UInt64, updates: AsyncStream<AccessState>)

    func value() async -> Bool {
        guard !Task.isCancelled else { return false }
        switch self {
        case let .answered(answer): return answer
        case let .probing(generation, updates):
            for await state in updates {
                guard !Task.isCancelled, state.generation == generation else { return false }
                if state.phase == .idle { return state.ready }
            }
            return false
        }
    }
}
