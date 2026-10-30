import MessageCodec
import ClientFind
import ClientConnect
import ClientReview
import ClientPayment
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

extension ClientFind.State: LogDescribable {
    public var logDescription: String {
        switch phase {
        case .idle: "idle"
        case .startingScan: "startingScan"
        case .scanning: "scanning \(selection.logDescription)"
        case .stoppingScan: "stoppingScan"
        case .handedOver: "handedOver"
        }
    }
}
extension ClientFind.Selection: LogDescribable {
    public var logDescription: String {
        switch self {
        case .none: "none"
        case .host: "host"
        case .holdCloser: "holdCloser"
        case .gone: "gone"
        }
    }
}
extension ClientConnect.State: LogDescribable {
    public var logDescription: String {
        switch phase {
        case .idle: "idle"
        case .connecting(let step):
            switch step {
            case .startingDeadline: "connecting startingDeadline"
            case .connecting: "connecting connecting"
            case .deriving: "connecting deriving"
            case .writingKey: "connecting writingKey"
            case .waitingForAmount: "connecting waitingForAmount"
            case .openingAmount: "connecting openingAmount"
            case .stoppingDeadline: "connecting stoppingDeadline"
            }
        case .couldNotConnect: "couldNotConnect"
        case .handedOver: "handedOver"
        case .ending: "ending"
        case .over: "over"
        }
    }
}
extension ClientReview.State: LogDescribable {
    public var logDescription: String {
        switch phase {
        case .reviewing: "reviewing"
        case .sending(.confirm): "sending confirm"
        case .sending(.decline): "sending decline"
        case .ended(.declined): "ended declined"
        case .ended(.hostCancelled): "ended hostCancelled"
        case .ended(.linkLost(.notCharged)): "ended linkLost notCharged"
        case .ended(.linkLost(.unknown)): "ended linkLost unknown"
        case .handedOver: "handedOver"
        case .over: "over"
        }
    }
}
extension ClientPayment.State: LogDescribable {
    public var logDescription: String {
        switch status {
        case .waiting: "waiting"
        case .paid: "paid"
        case .failed: "failed"
        case .lost: "lost"
        case .over: "over"
        }
    }
}

func logMessage(_ bytes: [UInt8], direction: String, category: LogEntry.Category, log: any LogSink) {
    guard let frame = try? MessageCodec.decodeFrame(bytes) else { return }
    log.write(.init(category: category, message: "message \(direction) kind=\(frame.kind.logName) counter=\(frame.counter) length=\(bytes.count)"))
}

private extension MessageCodec.Kind {
    var logName: String {
        switch self {
        case .amount: "amount"
        case .decision: "decision"
        case .acknowledgement: "acknowledgement"
        case .result: "result"
        case .end: "end"
        }
    }
}
