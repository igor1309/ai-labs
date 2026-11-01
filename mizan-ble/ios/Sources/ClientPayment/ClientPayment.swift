public enum ClientPayment {
    public enum Outcome: Equatable, Sendable {
        case success, failure
    }

    public enum Status: Equatable, Sendable {
        /// The host is processing the acknowledged payment; there is no payer exit.
        case waiting
        /// The amount was paid to the handed-over host.
        case paid
        /// The payment failed and nothing was charged.
        case failed
        /// The link was lost before a result; whether payment happened is unknown.
        case lost
        /// The payer is done; the root can end this transaction.
        case over
    }

    public struct State: Equatable, Sendable {
        public let hostName: String?
        public let amountMinorUnits: UInt64
        public fileprivate(set) var status: Status = .waiting
        fileprivate var resourcesReleased = false
        fileprivate var doneRequested = false
        fileprivate var pendingMessages = 0
        fileprivate var linkLost = false

        /// The host and amount from the secure link's acknowledged confirm.
        public init(hostName: String?, amountMinorUnits: UInt64) {
            self.hostName = hostName
            self.amountMinorUnits = amountMinorUnits
        }
    }

    public enum Event: Equatable, Sendable {
        case message([UInt8])
        case opened(Outcome?)
        case linkDropped
        case done
        case finished
    }

    public enum Effect: Equatable, Sendable {
        case open([UInt8])
        case finish
    }

    @MainActor public protocol Session {
        /// Opens and decodes a result; refused or non-result messages return nil.
        func open(_ message: [UInt8]) -> Outcome?
        func close()
    }

    @MainActor public protocol Link {
        func drop()
    }

    public static func reduce(_ state: State, _ event: Event) -> (State, Effect?) {
        var next = state
        switch (state.status, event) {
        case (.waiting, .message(let message)) where !state.linkLost:
            next.pendingMessages += 1
            return (next, .open(message))
        case (.waiting, .opened(let outcome)):
            if next.pendingMessages > 0 { next.pendingMessages -= 1 }
            if let outcome {
                next.status = outcome == .success ? .paid : .failed
            }
            // A received message still needs the session, even after link loss
            // or another message has supplied the payment outcome.
            if next.pendingMessages == 0 {
                if next.status != .waiting { return (next, .finish) }
                if next.linkLost {
                    next.status = .lost
                    return (next, .finish)
                }
            }
        case (.paid, .opened) where state.pendingMessages > 0,
             (.failed, .opened) where state.pendingMessages > 0:
            next.pendingMessages -= 1
            if next.pendingMessages == 0 { return (next, .finish) }
        case (.waiting, .linkDropped):
            next.linkLost = true
            if next.pendingMessages == 0 {
                next.status = .lost
                return (next, .finish)
            }
        case (.paid, .done), (.failed, .done), (.lost, .done):
            // The root may end the flow as soon as it reads over, so cleanup
            // must have run even when the payer beats the independent effect.
            next.doneRequested = true
            if next.resourcesReleased { next.status = .over }
        case (.paid, .finished), (.failed, .finished), (.lost, .finished):
            next.resourcesReleased = true
            if next.doneRequested { next.status = .over }
        default:
            break
        }
        return (next, nil)
    }

    @MainActor public final class EffectHandler {
        private let session: any Session
        private let link: any Link

        public init(session: any Session, link: any Link) {
            self.session = session
            self.link = link
        }

        public func handle(_ effect: Effect) -> AsyncStream<Event> {
            AsyncStream { continuation in
                switch effect {
                case .open(let message):
                    continuation.yield(.opened(session.open(message)))
                case .finish:
                    session.close()
                    link.drop()
                    continuation.yield(.finished)
                }
                continuation.finish()
            }
        }
    }
}
