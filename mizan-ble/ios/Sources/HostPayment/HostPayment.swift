public enum HostPayment {
    public enum Decision: Equatable, Sendable { case confirm, decline }
    public enum Outcome: Equatable, Sendable { case success, failure }
    public enum Message: Equatable, Sendable {
        case acknowledgement
        case result(Outcome)
        case end
    }

    @MainActor public protocol Session: AnyObject {
        func open(_ bytes: [UInt8]) throws -> Decision
        func seal(_ message: Message) throws -> [UInt8]
        func close()
    }

    @MainActor public protocol Sender: AnyObject {
        /// Takes the bytes into the radio's ordered queue, throwing only on failure.
        func send(_ bytes: [UInt8]) throws
    }

    @MainActor public protocol Link: AnyObject {
        /// Finishes the service after its queued messages have left.
        func end()
    }

    public enum Phase: Equatable, Sendable {
        case awaitingDecision, choosingOutcome, declined, paid, failed, linkLost, cancelled, over
    }

    public struct State: Equatable, Sendable {
        public fileprivate(set) var amount: String
        public fileprivate(set) var phase: Phase = .awaitingDecision
        public fileprivate(set) var resultSent = false
        public fileprivate(set) var nothingCharged = true
        fileprivate var cleanupComplete = false
        fileprivate var pending: Pending?
        fileprivate var queuedOutcome: Outcome?

        /// The amount already sent on the secure link; the root supplies that link's ports.
        public init(amount: String) { self.amount = amount }

        public var canEnterNewAmount: Bool { cleanupComplete && phase != .over }
        /// The root can end this machine and return the host to amount entry.
        public var isOver: Bool { phase == .over }
    }

    fileprivate enum Pending: Equatable, Sendable {
        case sealing(Message), sending(Message), closing, ending
    }

    public enum Event: Equatable, Sendable {
        case message([UInt8])
        case opened(Decision)
        case refused
        case outcome(Outcome)
        case linkLost
        case cancel
        case newAmount
        case sealed(Message, [UInt8])
        case sendFailed(Message)
        case sent(Message)
        case sessionClosed
        case linkEnded
    }

    public enum Effect: Equatable, Sendable {
        case open([UInt8])
        case seal(Message)
        case send(Message, [UInt8])
        case closeSession
        case endLink
    }

    public static func reduce(_ state: State, _ event: Event) -> (State, Effect?) {
        guard !state.isOver else { return (state, nil) }
        var next = state
        switch event {
        case .message(let bytes) where state.phase == .awaitingDecision:
            return (next, .open(bytes))
        case .opened(.decline) where state.phase == .awaitingDecision:
            next.phase = .declined
            next.pending = .sealing(.acknowledgement)
            return (next, .seal(.acknowledgement))
        case .opened(.confirm) where state.phase == .awaitingDecision:
            next.phase = .choosingOutcome
            next.pending = .sealing(.acknowledgement)
            return (next, .seal(.acknowledgement))
        case .sealed(let message, let bytes) where state.pending == .sealing(message):
            next.pending = .sending(message)
            return (next, .send(message, bytes))
        case .sent(.acknowledgement) where state.pending == .sending(.acknowledgement):
            if let outcome = state.queuedOutcome {
                next.queuedOutcome = nil
                next.pending = .sealing(.result(outcome))
                return (next, .seal(.result(outcome)))
            } else if state.phase == .choosingOutcome {
                next.pending = nil
            } else {
                next.pending = .closing
                return (next, .closeSession)
            }
        case .outcome(let outcome) where state.phase == .choosingOutcome:
            next.phase = outcome == .success ? .paid : .failed
            next.nothingCharged = outcome != .success
            // A pick is accepted immediately; its result follows the acknowledgement in radio order.
            if state.pending != nil {
                next.queuedOutcome = outcome
                return (next, nil)
            }
            next.pending = .sealing(.result(outcome))
            return (next, .seal(.result(outcome)))
        case .sent(.result(let outcome)) where state.pending == .sending(.result(outcome)):
            next.resultSent = true
            next.pending = .closing
            return (next, .closeSession)
        case .sendFailed(let message) where
            state.pending == .sending(message) || state.pending == .sealing(message):
            next.phase = .linkLost
            next.nothingCharged = true
            next.queuedOutcome = nil
            next.pending = .closing
            return (next, .closeSession)
        case .linkLost where !state.cleanupComplete && !state.resultSent && state.phase != .linkLost &&
            state.pending != .closing && state.pending != .ending:
            next.phase = .linkLost
            next.nothingCharged = true
            next.queuedOutcome = nil
            next.pending = .closing
            return (next, .closeSession)
        case .cancel where state.phase == .awaitingDecision:
            next.phase = .cancelled
            next.pending = .sealing(.end)
            return (next, .seal(.end))
        case .sent(.end) where state.pending == .sending(.end):
            next.pending = .closing
            return (next, .closeSession)
        case .newAmount where state.canEnterNewAmount:
            next.phase = .over
        case .sessionClosed where state.pending == .closing:
            next.pending = .ending
            return (next, .endLink)
        case .linkEnded where state.pending == .ending:
            next.pending = nil
            next.cleanupComplete = true
        default:
            break
        }
        return (next, nil)
    }

    @MainActor public final class EffectHandler {
        private let session: any Session
        private let sender: any Sender
        private let link: any Link

        public init(session: any Session, sender: any Sender, link: any Link) {
            self.session = session
            self.sender = sender
            self.link = link
        }

        public func handle(_ effect: Effect) async -> Event? {
            switch effect {
            case .open(let bytes):
                do { return .opened(try session.open(bytes)) }
                catch { return .refused }
            case .seal(let message):
                do { return .sealed(message, try session.seal(message)) }
                catch { return .sendFailed(message) }
            case .send(let message, let bytes):
                do {
                    try sender.send(bytes)
                    return .sent(message)
                } catch { return .sendFailed(message) }
            case .closeSession:
                session.close()
                return .sessionClosed
            case .endLink:
                link.end()
                return .linkEnded
            }
        }
    }
}
