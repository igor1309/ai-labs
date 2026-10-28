public enum HostBroadcast {
    /// Identifies an attempt within this machine, including work that finishes late.
    public struct Attempt: Hashable, Sendable {
        public let number: UInt64
        public init(number: UInt64) { self.number = number }
    }

    public struct Session: Equatable, Sendable {
        public let id: [UInt8]
        public let publicKey: [UInt8]
        public init(id: [UInt8], publicKey: [UInt8]) {
            self.id = id
            self.publicKey = publicKey
        }
    }

    public struct Link: Equatable, Sendable {
        public let id: String
        public init(id: String) { self.id = id }
    }

    public struct SecureLink: Equatable, Sendable {
        public let attempt: Attempt
        public let session: Session
        public let link: Link
        public let amount: String
    }

    public struct ProtectedAmount: Equatable, Sendable {
        public let bytes: [UInt8]
        public init(bytes: [UInt8]) { self.bytes = bytes }
    }

    public enum HandshakeStep: Equatable, Sendable {
        case stoppingAdvertising, derivingKey, sealingAmount, sendingAmount
    }

    public enum Phase: Equatable, Sendable {
        case ready, goingOnAir, advertising, handshake(HandshakeStep)
        case failed, timedOut, handedOver(SecureLink)
    }

    public struct State: Equatable, Sendable {
        public fileprivate(set) var phase: Phase = .ready
        public fileprivate(set) var amount = ""
        public fileprivate(set) var reason: String?
        public fileprivate(set) var secondsLeft: Int?
        public fileprivate(set) var attempt: Attempt?
        fileprivate var nextAttempt: UInt64 = 0
        fileprivate var duration: Int?
        fileprivate var session: Session?
        fileprivate var link: Link?
        fileprivate var clientKey: [UInt8]?
        fileprivate var preparation: Preparation?

        public init() {}
        public var canCancel: Bool { phase == .goingOnAir || phase == .advertising }
        public var canRetry: Bool { phase == .failed }
        public var canChooseNewAmount: Bool { phase == .failed }
        fileprivate var isHandshaking: Bool {
            if case .handshake = phase { true } else { false }
        }
    }

    fileprivate enum Preparation: Equatable, Sendable {
        case readingSetting, openingSession, serving, awaitingAir
    }

    public enum Event: Equatable, Sendable {
        case lock(amount: String), cancel, retry, newAmount
        case transactionEnded(Attempt)
        case onAir(Attempt), couldNotGoOnAir(Attempt, reason: String)
        case bluetoothUnavailable(Attempt, reason: String)
        case clientKey(Attempt, Link, key: [UInt8]), linkLost(Attempt, Link)
        case secondsLeft(Attempt, Int)
        case countdownRead(Attempt, Int), sessionOpened(Attempt, Session), served(Attempt)
        case advertisingRequested(Attempt), countdownStarted(Attempt)
        case advertisingStopped(Attempt), keyDerived(Attempt), amountSent(Attempt)
        case amountSealed(Attempt, ProtectedAmount)
        case handshakeFailed(Attempt, reason: String)
        case countdownStopped(Attempt, retire: Bool), retired(Attempt)
    }

    public enum Effect: Equatable, Sendable {
        case readCountdown(Attempt), openSession(Attempt), serve(Attempt, Session)
        case advertise(Attempt), startCountdown(Attempt, Int), stopAdvertising(Attempt)
        case deriveKey(Attempt, [UInt8]), sealAmount(Attempt, String)
        case sendAmount(Attempt, Link, ProtectedAmount)
        case stopCountdown(Attempt, retire: Bool), retire(Attempt), closeSession(Attempt)
    }

    @MainActor public protocol SessionProvider {
        func open(for attempt: Attempt) -> Session
        func derive(clientKey: [UInt8], for attempt: Attempt) throws
        func seal(amount: String, for attempt: Attempt) throws -> ProtectedAmount
        /// Idempotent, including an attempt whose session has not opened yet.
        func close(_ attempt: Attempt)
    }

    @MainActor public protocol Advertiser {
        /// Waits for serving, including a previous service's finish, without blocking cancellation.
        func serve(_ session: Session, for attempt: Attempt) async throws
        func advertise(_ attempt: Attempt) throws
        func stopAdvertising(_ attempt: Attempt)
        /// Also stops advertising and rejects later work for this attempt, even if unserved.
        func retire(_ attempt: Attempt)
    }

    @MainActor public protocol Sender {
        /// Takes the protected amount for this session's client, or throws on failure.
        func sendAmount(_ message: ProtectedAmount, to link: Link, for attempt: Attempt) throws
    }

    @MainActor public protocol Countdown {
        /// Ticks return through secondsLeft events tagged with this attempt.
        func start(seconds: Int, for attempt: Attempt)
        func stop(_ attempt: Attempt)
    }

    @MainActor public protocol CountdownSetting {
        func seconds() -> Int
    }

    @MainActor public final class Handler {
        private let session: any SessionProvider
        private let advertiser: any Advertiser
        private let sender: any Sender
        private let countdown: any Countdown
        private let setting: any CountdownSetting

        public init(session: any SessionProvider, advertiser: any Advertiser,
                    sender: any Sender, countdown: any Countdown, setting: any CountdownSetting) {
            self.session = session
            self.advertiser = advertiser
            self.sender = sender
            self.countdown = countdown
            self.setting = setting
        }

        /// currentState reads the executing machine's live state when the effect runs.
        public func handle(_ effect: Effect, currentState: () -> State) async -> Event? {
            switch effect {
            case .readCountdown(let attempt):
                return .countdownRead(attempt, setting.seconds())
            case .openSession(let attempt):
                return .sessionOpened(attempt, session.open(for: attempt))
            case .serve(let attempt, let descriptor):
                do {
                    try await advertiser.serve(descriptor, for: attempt)
                    return .served(attempt)
                } catch {
                    return .couldNotGoOnAir(attempt, reason: String(describing: error))
                }
            case .advertise(let attempt):
                do {
                    try advertiser.advertise(attempt)
                    return .advertisingRequested(attempt)
                } catch {
                    return .couldNotGoOnAir(attempt, reason: String(describing: error))
                }
            case .startCountdown(let attempt, let seconds):
                countdown.start(seconds: seconds, for: attempt)
                return .countdownStarted(attempt)
            case .stopCountdown(let attempt, let retire):
                countdown.stop(attempt)
                return .countdownStopped(attempt, retire: retire)
            case .retire(let attempt):
                advertiser.retire(attempt)
                return .retired(attempt)
            case .closeSession(let attempt):
                session.close(attempt)
                return nil
            case .stopAdvertising(let attempt):
                advertiser.stopAdvertising(attempt)
                return .advertisingStopped(attempt)
            case .deriveKey(let attempt, let key):
                do {
                    try session.derive(clientKey: key, for: attempt)
                    return .keyDerived(attempt)
                } catch {
                    return .handshakeFailed(attempt, reason: String(describing: error))
                }
            case .sealAmount(let attempt, let amount):
                do {
                    let message = try session.seal(amount: amount, for: attempt)
                    return .amountSealed(attempt, message)
                } catch {
                    return .handshakeFailed(attempt, reason: String(describing: error))
                }
            case .sendAmount(let attempt, let link, let message):
                let state = currentState()
                guard state.attempt == attempt && state.phase == .handshake(.sendingAmount) else { return nil }
                // The check and synchronous send share MainActor, so expiry cannot interleave.
                do {
                    try sender.sendAmount(message, to: link, for: attempt)
                    return .amountSent(attempt)
                } catch {
                    return .handshakeFailed(attempt, reason: String(describing: error))
                }
            }
        }
    }

    public static func reduce(_ state: State, _ event: Event) -> (State, Effect?) {
        var next = state
        switch event {
        case .lock(let amount) where state.phase == .ready || state.phase == .timedOut:
            return begin(state, amount: amount)
        case .retry where state.canRetry:
            return begin(state, amount: state.amount)
        case .newAmount where state.canChooseNewAmount:
            return reset(state)
        case .transactionEnded(let attempt):
            guard case .handedOver(let secure) = state.phase, secure.attempt == attempt else { return (state, nil) }
            return reset(state)
        case .countdownRead(let attempt, let seconds)
            where state.attempt == attempt && state.preparation == .readingSetting:
            next.duration = seconds
            next.preparation = .openingSession
            return (next, .openSession(attempt))
        case .sessionOpened(let attempt, let descriptor)
            where state.attempt == attempt && state.preparation == .openingSession:
            next.session = descriptor
            next.preparation = .serving
            return (next, .serve(attempt, descriptor))
        case .sessionOpened(let attempt, _) where state.attempt != attempt:
            return (state, .closeSession(attempt))
        case .served(let attempt) where state.attempt == attempt && state.preparation == .serving:
            next.preparation = .awaitingAir
            return (next, .advertise(attempt))
        case .onAir(let attempt)
            where state.attempt == attempt && state.preparation == .awaitingAir:
            guard let duration = state.duration else { return (state, nil) }
            next.preparation = nil
            next.phase = .advertising
            next.secondsLeft = duration
            return (next, .startCountdown(attempt, duration))
        case .countdownStarted(let attempt):
            guard state.attempt != attempt || (state.phase != .advertising && !state.isHandshaking) else {
                return (state, nil)
            }
            return (state, .stopCountdown(attempt, retire: false))
        case .cancel where state.canCancel:
            return end(state, phase: .ready, amount: state.amount)
        case .couldNotGoOnAir(let attempt, let reason):
            guard state.attempt == attempt && state.canCancel else { return (state, nil) }
            return end(state, phase: .ready, amount: state.amount, reason: reason)
        case .bluetoothUnavailable(let attempt, let reason):
            guard state.attempt == attempt else { return (state, nil) }
            if state.isHandshaking { return end(state, phase: .failed, amount: state.amount, reason: reason) }
            guard state.canCancel else { return (state, nil) }
            return end(state, phase: .ready, amount: state.amount, reason: reason)
        case .secondsLeft(let attempt, let seconds)
            where state.attempt == attempt && (state.phase == .advertising || state.isHandshaking):
            if seconds <= 0 { return end(state, phase: .timedOut, amount: "") }
            next.secondsLeft = seconds
            return (next, nil)
        case .clientKey(let attempt, let link, let key)
            where state.attempt == attempt && state.phase == .advertising:
            next.phase = .handshake(.stoppingAdvertising)
            next.link = link
            next.clientKey = key
            return (next, .stopAdvertising(attempt))
        case .advertisingStopped(let attempt)
            where state.attempt == attempt && state.phase == .handshake(.stoppingAdvertising):
            guard let key = state.clientKey else { return (state, nil) }
            next.phase = .handshake(.derivingKey)
            return (next, .deriveKey(attempt, key))
        case .keyDerived(let attempt)
            where state.attempt == attempt && state.phase == .handshake(.derivingKey):
            next.phase = .handshake(.sealingAmount)
            return (next, .sealAmount(attempt, state.amount))
        case .amountSealed(let attempt, let message)
            where state.attempt == attempt && state.phase == .handshake(.sealingAmount):
            guard let link = state.link else { return (state, nil) }
            next.phase = .handshake(.sendingAmount)
            return (next, .sendAmount(attempt, link, message))
        case .amountSent(let attempt)
            where state.attempt == attempt && state.phase == .handshake(.sendingAmount):
            guard let secure = secureLink(state) else { return (state, nil) }
            next.phase = .handedOver(secure)
            next.secondsLeft = nil
            return (next, .stopCountdown(attempt, retire: false))
        case .handshakeFailed(let attempt, let reason) where state.attempt == attempt && state.isHandshaking:
            return end(state, phase: .failed, amount: state.amount, reason: reason)
        case .linkLost(let attempt, let link)
            where state.attempt == attempt && state.link == link && state.isHandshaking:
            return end(state, phase: .failed, amount: state.amount, reason: "Client link lost")
        case .countdownStopped(let attempt, retire: true):
            return (state, .retire(attempt))
        case .retired(let attempt):
            return (state, .closeSession(attempt))
        default:
            return (state, nil)
        }
    }

    private static func secureLink(_ state: State) -> SecureLink? {
        guard let attempt = state.attempt, let session = state.session, let link = state.link else { return nil }
        return SecureLink(attempt: attempt, session: session, link: link, amount: state.amount)
    }

    private static func begin(_ state: State, amount: String) -> (State, Effect?) {
        var next = State()
        next.nextAttempt = state.nextAttempt + 1
        let attempt = Attempt(number: next.nextAttempt)
        next.attempt = attempt
        next.amount = amount
        next.phase = .goingOnAir
        next.preparation = .readingSetting
        return (next, .readCountdown(attempt))
    }

    private static func reset(_ state: State) -> (State, Effect?) {
        var next = State()
        next.nextAttempt = state.nextAttempt
        return (next, nil)
    }

    private static func end(_ state: State, phase: Phase, amount: String, reason: String? = nil) -> (State, Effect?) {
        var next = State()
        next.nextAttempt = state.nextAttempt
        next.phase = phase
        next.amount = amount
        next.reason = reason
        return (next, state.attempt.map { .stopCountdown($0, retire: true) })
    }
}
