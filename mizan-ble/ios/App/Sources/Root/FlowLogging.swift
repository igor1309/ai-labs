import AmountEntry
import HostBroadcast
import HostPayment

extension AmountEntry.State: LogDescribable {
    public var logDescription: String { "typing digits=\(amount.filter(\.isNumber).count)" }
}

extension HostBroadcast.State: LogDescribable {
    public var logDescription: String {
        switch phase {
        case .ready: "ready"
        case .goingOnAir: "goingOnAir"
        case .advertising: "advertising seconds=\(secondsLeft ?? 0)"
        case .handshake(let step):
            switch step {
            case .stoppingAdvertising: "handshake stoppingAdvertising"
            case .derivingKey: "handshake derivingKey"
            case .sealingAmount: "handshake sealingAmount"
            case .sendingAmount: "handshake sendingAmount"
            }
        case .failed: "failed"
        case .timedOut: "timedOut"
        case .handedOver: "handedOver"
        }
    }
}

extension HostPayment.State: LogDescribable {
    public var logDescription: String {
        switch phase {
        case .awaitingDecision: "awaitingDecision"
        case .choosingOutcome: "choosingOutcome"
        case .declined: "declined"
        case .paid: "paid"
        case .failed: "failed"
        case .linkLost: "linkLost"
        case .cancelled: "cancelled"
        case .over: "over"
        }
    }
}

@MainActor func loggedReducer<State: Equatable & LogDescribable, Event, Effect>(
    _ reduce: @escaping (State, Event) -> (State, Effect?),
    initial: State, category: LogEntry.Category, log: any LogSink,
    changed: @escaping (State, State) -> Void
) -> (State, Event) -> (State, Effect?) {
    log.write(.init(category: category, message: initial.logDescription))
    return { state, event in
        let (next, effect) = reduce(state, event)
        if next != state {
            log.write(.init(category: category, message: next.logDescription))
            changed(state, next)
        }
        return (next, effect)
    }
}
