import Lifecycle
import Testing

struct LifecycleReducerTests {

    @Test func quitWhileRunningStopsDelivery_state() { assert(.running, .quit, reducedTo: .stoppingDelivery) }
    @Test func quitWhileRunningStopsDelivery_effect() { assert(.running, .quit, effect: .stopDelivery) }

    @Test func stoppedDeliveryStopsRecording_state() { assert(.stoppingDelivery, .deliveryStopped, reducedTo: .draining) }
    @Test func stoppedDeliveryStopsRecording_effect() { assert(.stoppingDelivery, .deliveryStopped, effect: .stopRecording) }

    @Test func drainedRecordingWaitsForIdle_state() { assert(.draining, .drained, reducedTo: .waiting) }
    @Test func drainedRecordingWaitsForIdle_effect() { assert(.draining, .drained, effect: .waitForIdle) }

    @Test func idleRecordingEnds_state() { assert(.waiting, .idle, reducedTo: .ending) }
    @Test func idleRecordingEnds_effect() { assert(.waiting, .idle, effect: .end) }

    @Test func endedRecordingTerminates_state() { assert(.ending, .ended, reducedTo: .terminating) }
    @Test func endedRecordingTerminates_effect() { assert(.ending, .ended, effect: .terminate) }

    @Test func terminationCompletes_state() { assert(.terminating, .terminated, reducedTo: .terminated) }
    @Test func terminationCompletes_effect() { assert(.terminating, .terminated, effect: nil) }

    /// Waiting without idle (an ended observation) neither ends nor terminates.
    @Test func drainedWhileWaitingStays_state() { assert(.waiting, .drained, reducedTo: .waiting) }
    @Test func drainedWhileWaitingStays_effect() { assert(.waiting, .drained, effect: nil) }

    @Test func repeatedQuitIsIgnored_state() {

        for state in LifecycleState.all where state != .running { assert(state, .quit, reducedTo: state) }
    }

    @Test func repeatedQuitIsIgnored_effect() {

        for state in LifecycleState.all where state != .running { assert(state, .quit, effect: nil) }
    }

    @Test func outOfOrderEventsAreIgnored_state() {

        for (state, event) in outOfOrder { assert(state, event, reducedTo: state) }
    }

    @Test func outOfOrderEventsAreIgnored_effect() {

        for (state, event) in outOfOrder { assert(state, event, effect: nil) }
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
