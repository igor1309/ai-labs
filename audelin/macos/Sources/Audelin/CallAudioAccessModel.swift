import CallAudioAccess
import CallAudioProbe
import Foundation
import IMRxObservation

func makeCallAudioAccess() async -> AccessPolicy {
    let environment = OutputEnvironment()
    let probe = CallAudioProbe()
    let device: @Sendable () async -> UInt32? = { await environment.device() }
    let now: @Sendable () -> Double = { ProcessInfo.processInfo.systemUptime }
    let handler = AccessEffectHandler(probe: {
        switch await probe.measure() {
        case .heard: .heard
        case .silent: .silent
        case .refused: .refused
        }
    }, device: device, now: now, sleep: { try await ContinuousClock().sleep(for: $0) })
    let model = CallAudioAccessModel()
    await model.start(handler: handler, changes: environment.changes)
    return AccessPolicy(send: { await model.send($0) }, states: { await model.states() }, device: device, now: now)
}

/// The app owns the generic model and the lifetime of its environmental subscription.
actor CallAudioAccessModel {
    private var model: ObservableModel<AccessState, AccessEvent, AccessEffect>?
    private let feed = StateFeed<AccessState>()
    private var changes: Task<Void, Never>?

    func start(handler: AccessEffectHandler, changes: AsyncStream<Void>) {
        let feed = feed
        model = ObservableModel(initialState: AccessState(), reduce: { state, event in
            let (next, effect) = AccessReducer.reduce(state, event)
            if next != state { feed.publish(next) }
            return (next, effect)
        }, handleEffect: { effect in
            AsyncStream { output in
                let task = Task {
                    if let event = await handler.handle(effect) { output.yield(event) }
                    output.finish()
                }
                output.onTermination = { _ in task.cancel() }
            }
        }, isolation: self)
        self.changes = Task { [weak self] in
            for await _ in changes { await self?.send(.invalidated) }
        }
    }

    func send(_ event: AccessEvent) { model?.event(event) }
    func states() -> AsyncStream<AccessState> { feed.subscribe(from: model?.state ?? .init()) }
    func end() { changes?.cancel(); changes = nil; feed.finish(); model = nil }
    deinit { changes?.cancel() }
}
