public enum ClientReview {
    public struct Host: Equatable, Sendable {
        public let id: String
        public let name: String?

        public init(id: String, name: String?) {
            self.id = id
            self.name = name
        }
    }

    public enum Decision: Equatable, Sendable { case confirm, decline }
    public enum Charge: Equatable, Sendable { case notCharged, unknown }
    public enum Outcome: Equatable, Sendable {
        case declined, hostCancelled, linkLost(Charge)
    }
    public enum Phase: Equatable, Sendable {
        case reviewing, sending(Decision), ended(Outcome), handedOver, over
    }
    public enum Message: Equatable, Sendable {
        case decisionAcknowledged, end, unrelated
    }
    public enum WriteResult: Equatable, Sendable { case accepted, refused }

    fileprivate enum Cleanup: Equatable, Sendable { case none, closing, dropping, complete }

    public struct State: Equatable, Sendable {
        public let host: Host
        /// The handed-over amount, in hundredths of a Mizan.
        public let amount: UInt64
        public fileprivate(set) var phase: Phase = .reviewing
        public fileprivate(set) var acknowledgedDecision: Decision?
        fileprivate var writeStarted = false
        fileprivate var pendingMessages = 0
        fileprivate var deferredLinkLoss: Charge?
        fileprivate var cleanup: Cleanup = .none
        fileprivate var doneRequested = false
        /// The charge status of an ended review; absent while it is in progress.
        public var charge: Charge? {
            switch phase {
            case .ended(.declined), .ended(.hostCancelled): .notCharged
            case .ended(.linkLost(let charge)): charge
            case .reviewing, .sending, .handedOver, .over: nil
            }
        }
        public var canDecide: Bool { phase == .reviewing && deferredLinkLoss == nil }
        public var canFinish: Bool {
            if case .ended = phase { return !doneRequested }
            return false
        }
        public var isDone: Bool { phase == .handedOver || phase == .over }

        /// Takes the host and amount from an already secure link. The root keeps
        /// that link and session alive through an acknowledged-confirm hand-over.
        public init(host: Host, amount: UInt64) {
            self.host = host
            self.amount = amount
        }
    }

    public enum Event: Equatable, Sendable {
        case decide(Decision), done, message([UInt8]), linkLost
        case sealed(Decision, [UInt8])
        case written(Decision, WriteResult)
        case opened(Message?)
        case sessionClosed, linkDropped
    }

    public enum Effect: Equatable, Sendable {
        case seal(Decision), write(Decision, [UInt8]), open([UInt8])
        case closeSession, dropLink
    }

    @MainActor public protocol Session {
        func seal(_ decision: Decision) -> [UInt8]
        func open(_ bytes: [UInt8]) -> Message?
        func close()
    }

    @MainActor public protocol Sender {
        /// Sends one sealed decision, checked to fit the largest write before hand-over.
        /// Acceptance is the write response, not a decision acknowledgement.
        func write(_ bytes: [UInt8]) async -> WriteResult
    }

    @MainActor public protocol Link {
        func drop()
    }

    public static func reduce(_ state: State, _ event: Event) -> (State, Effect?) {
        var next = state
        // Completion waits for cleanup so the root can safely end the machine.
        switch event {
        case .opened(let message):
            guard next.pendingMessages > 0 else { return (state, nil) }
            next.pendingMessages -= 1
            return opened(next, message: message)
        case .sessionClosed:
            guard next.cleanup == .closing else { return (state, nil) }
            next.cleanup = .dropping
            return (next, .dropLink)
        case .linkDropped:
            guard next.cleanup == .dropping else { return (state, nil) }
            next.cleanup = .complete
            if next.doneRequested { next.phase = .over }
            return (next, nil)
        case .done:
            guard case .ended = next.phase else { return (state, nil) }
            if next.cleanup == .complete {
                next.phase = .over
            } else {
                next.doneRequested = true
            }
            return (next, nil)
        default:
            break
        }

        switch state.phase {
        case .reviewing, .sending: break
        case .ended, .handedOver, .over: return (state, nil)
        }
        guard state.deferredLinkLoss == nil else { return (state, nil) }

        switch event {
        case .decide(let decision):
            guard state.canDecide else { return (state, nil) }
            next.phase = .sending(decision)
            return (next, .seal(decision))
        case .sealed(let decision, let bytes):
            guard state.phase == .sending(decision), !state.writeStarted else { return (state, nil) }
            next.writeStarted = true
            return (next, .write(decision, bytes))
        case .written(let decision, let result):
            guard state.phase == .sending(decision), state.writeStarted else { return (state, nil) }
            switch result {
            case .accepted: return (state, nil)
            case .refused: return loseLink(state, charge: .notCharged)
            }
        case .message(let bytes):
            next.pendingMessages += 1
            return (next, .open(bytes))
        case .linkLost:
            let charge: Charge = state.phase == .sending(.confirm) && state.writeStarted ? .unknown : .notCharged
            return loseLink(state, charge: charge)
        case .opened, .done, .sessionClosed, .linkDropped:
            return (state, nil)
        }
    }

    private static func opened(_ state: State, message: Message?) -> (State, Effect?) {
        var next = state
        switch state.phase {
        case .ended(let outcome): return end(state, with: outcome)
        case .handedOver, .over: return (state, nil)
        case .reviewing, .sending: break
        }
        switch message {
        case .end:
            return end(state, with: .hostCancelled)
        case .decisionAcknowledged:
            if case .sending(let decision) = state.phase, state.writeStarted {
                next.acknowledgedDecision = decision
                switch decision {
                case .confirm:
                    next.phase = .handedOver
                    return (next, nil)
                case .decline:
                    return end(next, with: .declined)
                }
            }
        case .unrelated, nil: break
        }
        if let charge = state.deferredLinkLoss, state.pendingMessages == 0 {
            return end(state, with: .linkLost(charge))
        }
        return (state, nil)
    }

    private static func loseLink(_ state: State, charge: Charge) -> (State, Effect?) {
        guard state.pendingMessages > 0 else { return end(state, with: .linkLost(charge)) }
        var next = state
        // Received bytes can still carry the host's cancellation or acknowledgement.
        next.deferredLinkLoss = charge
        return (next, nil)
    }

    private static func end(_ state: State, with outcome: Outcome) -> (State, Effect?) {
        var next = state
        next.phase = .ended(outcome)
        guard state.pendingMessages == 0, state.cleanup == .none else { return (next, nil) }
        next.cleanup = .closing
        return (next, .closeSession)
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
            case .seal(let decision):
                return .sealed(decision, session.seal(decision))
            case .write(let decision, let bytes):
                return .written(decision, await sender.write(bytes))
            case .open(let bytes):
                return .opened(session.open(bytes))
            case .closeSession:
                session.close()
                return .sessionClosed
            case .dropLink:
                link.drop()
                return .linkDropped
            }
        }
    }
}
