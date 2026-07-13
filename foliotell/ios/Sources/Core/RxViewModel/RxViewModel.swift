import Combine
import Foundation

/// Serialized event-processing runtime for a state machine: events enter one
/// funnel, the reducer computes the next state, effects may dispatch
/// follow-up events processed in FIFO order.
@MainActor
public final class RxViewModel<State, Event, Effect>: ObservableObject {

    @Published public private(set) var state: State

    private let reduce: Reduce
    private let handleEffect: HandleEffect
    private let scheduler: EventScheduler
    private var pendingEvents: [Event] = []
    private var isProcessing = false

    public init(
        initialState: State,
        reduce: @escaping Reduce,
        handleEffect: @escaping HandleEffect,
        scheduler: EventScheduler = .mainQueue
    ) {

        self.state = initialState
        self.reduce = reduce
        self.handleEffect = handleEffect
        self.scheduler = scheduler
    }

    public func event(_ event: Event) {
        scheduler.schedule { [weak self] in
            self?.process(event)
        }
    }

    private func process(_ event: Event) {
        pendingEvents.append(event)
        guard isProcessing == false else {
            return
        }

        isProcessing = true
        while pendingEvents.isEmpty == false {
            let next = pendingEvents.removeFirst()
            let (newState, effect) = reduce(state, next)
            state = newState
            if let effect {
                handleEffect(effect) { [weak self] in
                    self?.event($0)
                }
            }
        }
        isProcessing = false
    }
}

public extension RxViewModel {

    /// Computes a new state and an optional effect from the current state and an event.
    typealias Reduce = (State, Event) -> (State, Effect?)

    /// Handles an effect and may dispatch follow-up events.
    typealias HandleEffect = (Effect, @escaping @MainActor (Event) -> Void) -> Void
}

/// Seam serializing event intake onto the main actor.
public struct EventScheduler: Sendable {

    let schedule: @Sendable (@escaping @MainActor () -> Void) -> Void

    /// Processes inline on the main actor. Main-actor isolation already
    /// serializes UI-originated events, so dispatching them again adds latency.
    public static let mainQueue = EventScheduler { action in
        MainActor.assumeIsolated { action() }
    }

    /// Processes inline; requires the caller to be on the main actor.
    public static let immediate = EventScheduler { action in
        MainActor.assumeIsolated { action() }
    }
}
