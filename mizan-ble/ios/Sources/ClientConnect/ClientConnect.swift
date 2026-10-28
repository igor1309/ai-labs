public enum ClientConnect {
    public struct Host: Equatable, Sendable {
        public let id: String
        public let name: String?

        public init(id: String, name: String?) {
            self.id = id
            self.name = name
        }
    }

    public struct HostSession: Equatable, Sendable {
        public let publicKey: [UInt8]
        public let id: [UInt8]

        public init(publicKey: [UInt8], id: [UInt8]) {
            self.publicKey = publicKey
            self.id = id
        }
    }

    public struct Connection: Equatable, Sendable {
        public let session: HostSession
        public let largestWrite: Int

        public init(session: HostSession, largestWrite: Int) {
            self.session = session
            self.largestWrite = largestWrite
        }
    }

    public struct SealedAmount: Equatable, Sendable {
        public let counter: UInt32
        public let box: [UInt8]

        public init(counter: UInt32, box: [UInt8]) {
            self.counter = counter
            self.box = box
        }
    }

    public struct Amount: Equatable, Sendable {
        public let minorUnits: UInt64

        public init(minorUnits: UInt64) {
            self.minorUnits = minorUnits
        }
    }

    public enum Failure: Error, Equatable, Sendable {
        case connection(String)
        case linkDropped
        case sessionDisagreement
        case deadlineExceeded
        case keyTooLarge
        case keyRefused(String)
        case decisionTooLarge
        case unreadableAmount
    }

    @MainActor public protocol Link: AnyObject, Sendable {
        func connect(to host: Host)
        func writeKey(_ key: [UInt8])
        func drop()
    }

    @MainActor public protocol Session: AnyObject, Sendable {
        /// Derives the key and returns this session's public key for the link's key write.
        func derive(with host: HostSession) -> Result<[UInt8], Failure>
        func open(_ amount: SealedAmount) -> Result<Amount, Failure>
        func close()
    }

    /// Expiry is delivered by the root as `deadlineExpired`, independently of link work.
    @MainActor public protocol Deadline {
        func start(seconds: Int)
        func stop()
    }

    public struct Handover: Equatable, Sendable {
        public let link: any Link
        public let session: any Session
        public let amount: Amount

        public init(link: any Link, session: any Session, amount: Amount) {
            self.link = link
            self.session = session
            self.amount = amount
        }

        public static func == (lhs: Self, rhs: Self) -> Bool {
            lhs.link === rhs.link && lhs.session === rhs.session && lhs.amount == rhs.amount
        }
    }

    public enum Step: Equatable, Sendable {
        case startingDeadline, connecting, deriving, writingKey, waitingForAmount, openingAmount
        case stoppingDeadline
    }

    public enum Phase: Equatable, Sendable {
        case idle
        case connecting(Step)
        case couldNotConnect(Failure)
        case handedOver(Handover)
        case ending, over
    }

    public struct State: Equatable, Sendable {
        public let host: Host
        public fileprivate(set) var phase: Phase = .idle
        fileprivate var largestWrite = 0
        fileprivate var pendingAmount: SealedAmount?
        fileprivate var handover: Handover?
        fileprivate var cleanup: Cleanup = .none
        fileprivate var outstanding: Set<Work> = []

        /// The chosen host is handed in by the root; `start` begins this transaction.
        public init(host: Host) {
            self.host = host
        }

        public var canCancel: Bool {
            if case .connecting = phase { return true }
            return false
        }

        public var canRetry: Bool {
            if case .couldNotConnect = phase { return true }
            return false
        }

        public var isDone: Bool {
            switch phase {
            case .handedOver, .over: true
            default: false
            }
        }
    }

    fileprivate enum Cleanup: Equatable, Sendable {
        case none, stoppingDeadline, waitingForWork, droppingLink, closingSession, done
    }

    fileprivate enum Work: Hashable, Sendable {
        case startDeadline, connect, derive, writeKey, open
    }

    public enum Event: Sendable {
        case start, cancel, retry, deadlineStarted, deadlineExpired, linkDropped
        case connectionResult(Result<Connection, Failure>)
        case derivationResult(Result<[UInt8], Failure>)
        case keyWriteResult(Result<Void, Failure>)
        case amountReceived(SealedAmount)
        case amountOpened(Result<Amount, Failure>, link: any Link, session: any Session)
        case connectionInitiated, keyWriteInitiated
        case deadlineStopped, linkDroppedForCleanup, sessionClosed

        fileprivate var completedWork: Work? {
            switch self {
            case .deadlineStarted: .startDeadline
            case .connectionInitiated: .connect
            case .derivationResult: .derive
            case .keyWriteInitiated: .writeKey
            case .amountOpened: .open
            default: nil
            }
        }
    }

    public enum Effect: Equatable, Sendable {
        case startDeadline(seconds: Int)
        case connect(Host)
        case derive(HostSession)
        case writeKey([UInt8])
        case open(SealedAmount)
        case stopDeadline, dropLink, closeSession

        fileprivate var work: Work? {
            switch self {
            case .startDeadline: .startDeadline
            case .connect: .connect
            case .derive: .derive
            case .writeKey: .writeKey
            case .open: .open
            default: nil
            }
        }
    }

    public static func reduce(_ state: State, _ event: Event) -> (State, Effect?) {
        var next = state
        if let work = event.completedWork { next.outstanding.remove(work) }
        if state.cleanup == .waitingForWork && next.outstanding.isEmpty {
            // A delayed deadline start may have run after the first stop.
            next.cleanup = .stoppingDeadline
            return (next, .stopDeadline)
        }
        switch event {
        case .start where state.phase == .idle:
            next.phase = .connecting(.startingDeadline)
            return issuing(next, .startDeadline(seconds: 10))
        case .deadlineStarted where state.phase == .connecting(.startingDeadline):
            next.phase = .connecting(.connecting)
            return issuing(next, .connect(state.host))
        case .connectionResult(.success(let connection)) where state.phase == .connecting(.connecting):
            next.largestWrite = connection.largestWrite
            next.phase = .connecting(.deriving)
            return issuing(next, .derive(connection.session))
        case .derivationResult(.success(let key)) where state.phase == .connecting(.deriving):
            guard key.count <= state.largestWrite else { return failed(next, .keyTooLarge) }
            // A sealed one-byte decision needs a 34-byte write.
            guard state.largestWrite >= 34 else { return failed(next, .decisionTooLarge) }
            next.phase = .connecting(.writingKey)
            return issuing(next, .writeKey(key))
        case .keyWriteResult(.success) where state.phase == .connecting(.writingKey):
            if let amount = state.pendingAmount {
                next.pendingAmount = nil
                next.phase = .connecting(.openingAmount)
                return issuing(next, .open(amount))
            }
            next.phase = .connecting(.waitingForAmount)
            return (next, nil)
        case .amountReceived(let amount) where state.phase == .connecting(.writingKey):
            // A notification can precede the acknowledgement of the key write.
            if next.pendingAmount == nil { next.pendingAmount = amount }
            return (next, nil)
        case .amountReceived(let amount) where state.phase == .connecting(.waitingForAmount):
            next.phase = .connecting(.openingAmount)
            return issuing(next, .open(amount))
        case .amountOpened(.success(let amount), let link, let session)
            where state.phase == .connecting(.openingAmount):
            next.handover = Handover(link: link, session: session, amount: amount)
            next.phase = .connecting(.stoppingDeadline)
            return (next, .stopDeadline)
        case .deadlineStopped where state.phase == .connecting(.stoppingDeadline):
            if let handover = state.handover {
                next.phase = .handedOver(handover)
                next.handover = nil
            }
            return (next, nil)
        case .connectionResult(.failure(let failure)) where state.phase == .connecting(.connecting):
            return failed(next, failure)
        case .derivationResult(.failure(let failure)) where state.phase == .connecting(.deriving):
            return failed(next, failure)
        case .keyWriteResult(.failure(let failure)) where state.phase == .connecting(.writingKey):
            return failed(next, failure)
        case .amountOpened(.failure(let failure), _, _) where state.phase == .connecting(.openingAmount):
            return failed(next, failure)
        case .linkDropped where state.canCancel:
            return failed(next, .linkDropped)
        case .deadlineExpired where state.canCancel && state.handover == nil:
            return failed(next, .deadlineExceeded)
        case .cancel where state.canCancel:
            next.phase = .ending
            next.pendingAmount = nil
            next.handover = nil
            next.cleanup = .stoppingDeadline
            return (next, .stopDeadline)
        case .retry where state.canRetry:
            next.phase = state.cleanup == .done ? .over : .ending
            return (next, nil)
        case .deadlineStopped where state.cleanup == .stoppingDeadline:
            // Resource work must finish before the final drop and close.
            guard next.outstanding.isEmpty else {
                next.cleanup = .waitingForWork
                return (next, nil)
            }
            next.cleanup = .droppingLink
            return (next, .dropLink)
        case .linkDroppedForCleanup where state.cleanup == .droppingLink:
            next.cleanup = .closingSession
            return (next, .closeSession)
        case .sessionClosed where state.cleanup == .closingSession:
            next.cleanup = .done
            if state.phase == .ending { next.phase = .over }
            return (next, nil)
        default:
            return (next, nil)
        }
    }

    private static func issuing(_ state: State, _ effect: Effect) -> (State, Effect?) {
        var next = state
        if let work = effect.work { next.outstanding.insert(work) }
        return (next, effect)
    }

    private static func failed(_ state: State, _ failure: Failure) -> (State, Effect?) {
        var next = state
        next.phase = .couldNotConnect(failure)
        next.pendingAmount = nil
        next.handover = nil
        next.cleanup = .stoppingDeadline
        return (next, .stopDeadline)
    }

    @MainActor public final class Handler {
        private let link: any Link
        private let session: any Session
        private let deadline: any Deadline

        public init(link: any Link, session: any Session, deadline: any Deadline) {
            self.link = link
            self.session = session
            self.deadline = deadline
        }

        public func handle(_ effect: Effect) async -> Event? {
            switch effect {
            case .startDeadline(let seconds):
                deadline.start(seconds: seconds)
                return .deadlineStarted
            case .connect(let host):
                link.connect(to: host)
                return .connectionInitiated
            case .derive(let host):
                return .derivationResult(session.derive(with: host))
            case .writeKey(let key):
                link.writeKey(key)
                return .keyWriteInitiated
            case .open(let amount):
                return .amountOpened(session.open(amount), link: link, session: session)
            case .stopDeadline:
                deadline.stop()
                return .deadlineStopped
            case .dropLink:
                link.drop()
                return .linkDroppedForCleanup
            case .closeSession:
                session.close()
                return .sessionClosed
            }
        }
    }
}
