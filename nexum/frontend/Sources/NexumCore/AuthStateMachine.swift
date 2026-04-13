import Foundation

public struct AuthState: Equatable, Sendable {
    public var phase: AuthPhase
    public var result: AuthResult?

    public init(phase: AuthPhase, result: AuthResult?) {
        self.phase = phase
        self.result = result
    }

    public static let initial = AuthState(phase: .resolving, result: nil)
}

public enum AuthPhase: Equatable, Sendable {
    case resolving
    case unauthenticated
    case authenticating
    case authenticated
}

public enum AuthResult: Equatable, Sendable {
    case token(Token)
    case failure(AuthError)
}

public struct Token: Equatable, Sendable {
    public var value: String
    public var expiresAt: Date

    public init(value: String, expiresAt: Date) {
        self.value = value
        self.expiresAt = expiresAt
    }
}

public enum AuthError: Equatable, Sendable {
    case invalidCredentials
    case serverError(String)
    case network
}

public enum AuthAction: Equatable, Sendable {
    case boot
    case credentialsSubmitted(username: String, password: String)
    case sessionObtained(Token)
    case resolutionFailed
    case authFailed(AuthError)
    case sessionLost
    case logout
}

public enum AuthEffect: Equatable, Sendable {
    case resolveSession
    case authenticate(username: String, password: String)
    case clearToken
}

public protocol SessionResolver: Sendable {
    func resolve() async -> Token?
}

public protocol Authenticator: Sendable {
    func authenticate(username: String, password: String) async -> AuthenticateResult
}

public enum AuthenticateResult: Equatable, Sendable {
    case success(Token)
    case failure(AuthError)
}

public protocol TokenCache: Sendable {
    func read() -> Token?
    func write(_ token: Token)
    func clear()
}

public protocol AuthEffectHandler: Sendable {
    func handle(_ effect: AuthEffect) async -> AuthAction?
}

public final class InMemoryTokenCache: TokenCache {
    private let lock = NSLock()
    private var token: Token?

    public init() {}

    public func read() -> Token? {

        lock.lock()
        defer { lock.unlock() }
        return token
    }

    public func write(_ token: Token) {
        lock.lock()
        defer { lock.unlock() }
        self.token = token
    }

    public func clear() {
        lock.lock()
        defer { lock.unlock() }
        token = nil
    }
}

extension InMemoryTokenCache: @unchecked Sendable {}

public struct DefaultAuthEffectHandler: AuthEffectHandler {
    private let sessionResolver: any SessionResolver
    private let authenticator: any Authenticator
    private let tokenCache: any TokenCache

    public init(
        sessionResolver: any SessionResolver,
        authenticator: any Authenticator,
        tokenCache: any TokenCache
    ) {
        self.sessionResolver = sessionResolver
        self.authenticator = authenticator
        self.tokenCache = tokenCache
    }

    public func handle(_ effect: AuthEffect) async -> AuthAction? {

        switch effect {
        case .resolveSession:
            return await mapResolveSession()
        case .authenticate(let username, let password):
            return await mapAuthenticate(username: username, password: password)
        case .clearToken:
            tokenCache.clear()
            return nil
        }
    }

    private func mapResolveSession() async -> AuthAction {

        guard let token = await sessionResolver.resolve() else {
            return .resolutionFailed
        }
        tokenCache.write(token)
        return .sessionObtained(token)
    }

    private func mapAuthenticate(username: String, password: String) async -> AuthAction {

        switch await authenticator.authenticate(username: username, password: password) {
        case .success(let token):
            tokenCache.write(token)
            return .sessionObtained(token)
        case .failure(let error):
            return .authFailed(error)
        }
    }
}

public struct ExpiringSessionResolver: SessionResolver {
    private let tokenProvider: @Sendable () -> Token?
    private let now: @Sendable () -> Date

    public init(
        tokenProvider: @escaping @Sendable () -> Token?,
        now: @escaping @Sendable () -> Date = { Date.now }
    ) {
        self.tokenProvider = tokenProvider
        self.now = now
    }

    public func resolve() async -> Token? {

        guard let token = tokenProvider() else {
            return nil
        }
        guard token.expiresAt > now() else {
            return nil
        }
        return token
    }
}

public func handleAuthEffect(
    _ effect: AuthEffect,
    using handler: any AuthEffectHandler
) -> AsyncStream<AuthAction> {

    AsyncStream { continuation in
        Task {
            if let action = await handler.handle(effect) {
                continuation.yield(action)
            }
            continuation.finish()
        }
    }
}

public func reduce(state: AuthState, action: AuthAction) -> (AuthState, AuthEffect?) {

    switch (state.phase, action) {
    case (.resolving, .boot):
        return (state, .resolveSession)

    case (.resolving, .sessionObtained(let token)):
        return (
            AuthState(phase: .authenticated, result: .token(token)),
            nil
        )

    case (.resolving, .resolutionFailed):
        return (
            AuthState(phase: .unauthenticated, result: nil),
            nil
        )

    case (.unauthenticated, .credentialsSubmitted(let username, let password)):
        return (
            AuthState(phase: .authenticating, result: state.result),
            .authenticate(username: username, password: password)
        )

    case (.authenticating, .sessionObtained(let token)):
        return (
            AuthState(phase: .authenticated, result: .token(token)),
            nil
        )

    case (.authenticating, .authFailed(let error)):
        return (
            AuthState(phase: .unauthenticated, result: .failure(error)),
            nil
        )

    case (.authenticated, .sessionLost):
        return (
            AuthState(phase: .unauthenticated, result: nil),
            .clearToken
        )

    case (.authenticated, .logout):
        return (
            AuthState(phase: .unauthenticated, result: nil),
            .clearToken
        )

    default:
        return (state, nil)
    }
}
