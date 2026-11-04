import Lifecycle
import Testing

struct LifecycleReducerTests {

    @Test func quitWhileRunningStopsDelivery_state() { assert(makeState(.running), .quit) { $0 = .stoppingDelivery } }
    @Test func quitWhileRunningStopsDelivery_effect() { assert(makeState(.running), .quit, delivers: .stopDelivery) }

    @Test func stoppedDeliveryStopsRecording_state() { assert(makeState(.stoppingDelivery), .deliveryStopped) { $0 = .draining } }
    @Test func stoppedDeliveryStopsRecording_effect() { assert(makeState(.stoppingDelivery), .deliveryStopped, delivers: .stopRecording) }

    @Test func drainedRecordingWaitsForIdle_state() { assert(makeState(.draining), .drained) { $0 = .waiting } }
    @Test func drainedRecordingWaitsForIdle_effect() { assert(makeState(.draining), .drained, delivers: .waitForIdle) }

    @Test func idleRecordingEnds_state() { assert(makeState(.waiting), .idle) { $0 = .ending } }
    @Test func idleRecordingEnds_effect() { assert(makeState(.waiting), .idle, delivers: .end) }

    @Test func endedRecordingTerminates_state() { assert(makeState(.ending), .ended) { $0 = .terminating } }
    @Test func endedRecordingTerminates_effect() { assert(makeState(.ending), .ended, delivers: .terminate) }

    @Test func terminationCompletes_state() { assert(makeState(.terminating), .terminated) { $0 = .terminated } }
    @Test func terminationCompletes_effect() { assert(makeState(.terminating), .terminated, delivers: nil) }

    /// Waiting without idle (an ended observation) neither ends nor terminates.
    @Test func drainedWhileWaitingStays_state() { assert(makeState(.waiting), .drained) }
    @Test func drainedWhileWaitingStays_effect() { assert(makeState(.waiting), .drained, delivers: nil) }

    @Test func repeatedQuitIsIgnored_state() {

        for state in LifecycleState.all where state != .running { assert(makeState(state), .quit) }
    }

    @Test func repeatedQuitIsIgnored_effect() {

        for state in LifecycleState.all where state != .running { assert(makeState(state), .quit, delivers: nil) }
    }

    @Test func outOfOrderEventsAreIgnored_state() {

        for (state, event) in outOfOrder { assert(makeState(state), event) }
    }

    @Test func outOfOrderEventsAreIgnored_effect() {

        for (state, event) in outOfOrder { assert(makeState(state), event, delivers: nil) }
    }
}

private let expected: Set<Pair> = [
    .init(.running, .quit), .init(.stoppingDelivery, .deliveryStopped), .init(.draining, .drained),
    .init(.waiting, .idle), .init(.ending, .ended), .init(.terminating, .terminated),
]

private let outOfOrder: [(LifecycleState, LifecycleEvent)] = LifecycleState.all.flatMap { state in
    LifecycleEvent.all.compactMap { expected.contains(.init(state, $0)) ? nil : (state, $0) }
}

private struct Pair: Hashable {

    let state: LifecycleState
    let event: LifecycleEvent
    init(_ state: LifecycleState, _ event: LifecycleEvent) { self.state = state; self.event = event }
}

private extension LifecycleState {

    static let all: [Self] = [.running, .stoppingDelivery, .draining, .waiting, .ending, .terminating, .terminated]
}

private extension LifecycleEvent {

    static let all: [Self] = [.quit, .deliveryStopped, .drained, .idle, .ended, .terminated]
}
