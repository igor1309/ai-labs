import Foundation
@testable import NexumCore
import XCTest

final class AuthReducerTests: XCTestCase {

    func test_initialState_shouldMatchSpecDefaults_onConstruction() {
        XCTAssertEqual(AuthState.initial, AuthState(phase: .resolving, result: nil))
    }

    func test_reduce_shouldEmitResolveSession_onBootFromResolving() {
        XCTAssertEqual(makeOutcome(state: .initial, action: .boot), ReduceOutcome(
            state: .initial,
            effect: .resolveSession
        ))
    }

    func test_reduce_shouldSetAuthenticatedPhaseWithToken_onSessionObtainedFromResolving() {
        let token = makeToken()
        XCTAssertEqual(makeOutcome(state: .initial, action: .sessionObtained(token)), ReduceOutcome(
            state: AuthState(phase: .authenticated, result: .token(token)),
            effect: nil
        ))
    }

    func test_reduce_shouldSetUnauthenticatedPhase_onResolutionFailedFromResolving() {
        XCTAssertEqual(makeOutcome(state: .initial, action: .resolutionFailed), ReduceOutcome(
            state: AuthState(phase: .unauthenticated, result: nil),
            effect: nil
        ))
    }

    func test_reduce_shouldSetAuthenticatingAndEmitAuthenticate_onCredentialsSubmittedFromUnauthenticated() {
        let state = AuthState(phase: .unauthenticated, result: nil)
        XCTAssertEqual(makeOutcome(state: state, action: .credentialsSubmitted(username: "user", password: "password")), ReduceOutcome(
            state: AuthState(phase: .authenticating, result: nil),
            effect: .authenticate(username: "user", password: "password")
        ))
    }

    func test_reduce_shouldSetAuthenticatedPhaseWithToken_onSessionObtainedFromAuthenticating() {
        let token = makeToken()
        let state = AuthState(phase: .authenticating, result: nil)
        XCTAssertEqual(makeOutcome(state: state, action: .sessionObtained(token)), ReduceOutcome(
            state: AuthState(phase: .authenticated, result: .token(token)),
            effect: nil
        ))
    }

    func test_reduce_shouldSetUnauthenticatedWithFailure_onAuthFailedFromAuthenticating() {
        let state = AuthState(phase: .authenticating, result: nil)
        XCTAssertEqual(makeOutcome(state: state, action: .authFailed(.invalidCredentials)), ReduceOutcome(
            state: AuthState(phase: .unauthenticated, result: .failure(.invalidCredentials)),
            effect: nil
        ))
    }

    func test_reduce_shouldSetUnauthenticatedAndEmitClearToken_onSessionLostFromAuthenticated() {
        let state = AuthState(phase: .authenticated, result: .token(makeToken()))
        XCTAssertEqual(makeOutcome(state: state, action: .sessionLost), ReduceOutcome(
            state: AuthState(phase: .unauthenticated, result: nil),
            effect: .clearToken
        ))
    }

    func test_reduce_shouldSetUnauthenticatedAndEmitClearToken_onLogoutFromAuthenticated() {
        let state = AuthState(phase: .authenticated, result: .token(makeToken()))
        XCTAssertEqual(makeOutcome(state: state, action: .logout), ReduceOutcome(
            state: AuthState(phase: .unauthenticated, result: nil),
            effect: .clearToken
        ))
    }

    func test_reduce_shouldIgnoreCredentialsSubmitted_onResolvingPhase() {
        XCTAssertEqual(makeOutcome(state: .initial, action: .credentialsSubmitted(username: "user", password: "password")), ReduceOutcome(
            state: .initial,
            effect: nil
        ))
    }

    func test_reduce_shouldIgnoreBoot_onAuthenticatedPhase() {
        let state = AuthState(phase: .authenticated, result: .token(makeToken()))
        XCTAssertEqual(makeOutcome(state: state, action: .boot), ReduceOutcome(
            state: state,
            effect: nil
        ))
    }

    // MARK: - Helpers

    private struct ReduceOutcome: Equatable {
        let state: AuthState
        let effect: AuthEffect?
    }

    private func makeOutcome(state: AuthState, action: AuthAction) -> ReduceOutcome {

        let reduced = reduce(state: state, action: action)
        return ReduceOutcome(state: reduced.0, effect: reduced.1)
    }

    private func makeToken(
        value: String = "token-value",
        expiresAt: Date = Date(timeIntervalSince1970: 2_000_000_000)
    ) -> Token {

        Token(value: value, expiresAt: expiresAt)
    }
}

final class AuthEffectHandlerTests: XCTestCase {

    func test_handle_shouldWriteTokenAndReturnSessionObtained_onResolveSessionWithValidToken() async {
        let token = makeToken()
        let cache = InMemoryTokenCache()
        let sut = makeSUT(
            sessionResolver: SessionResolverStub(result: token),
            authenticator: AuthenticatorStub(result: .failure(.network)),
            tokenCache: cache
        )

        let action = await sut.handle(.resolveSession)

        XCTAssertEqual(
            EffectOutcome(action: action, cachedToken: cache.read()),
            EffectOutcome(action: .sessionObtained(token), cachedToken: token)
        )
    }

    func test_handle_shouldReturnResolutionFailedAndKeepCacheEmpty_onResolveSessionWithNoToken() async {
        let cache = InMemoryTokenCache()
        let sut = makeSUT(
            sessionResolver: SessionResolverStub(result: nil),
            authenticator: AuthenticatorStub(result: .failure(.network)),
            tokenCache: cache
        )

        let action = await sut.handle(.resolveSession)

        XCTAssertEqual(
            EffectOutcome(action: action, cachedToken: cache.read()),
            EffectOutcome(action: .resolutionFailed, cachedToken: nil)
        )
    }

    func test_handle_shouldReturnResolutionFailedAndKeepCacheEmpty_onResolveSessionWithExpiredToken() async {
        let now = Date(timeIntervalSince1970: 10_000)
        let expiredToken = Token(value: "expired", expiresAt: now.addingTimeInterval(-1))
        let cache = InMemoryTokenCache()
        let resolver = ExpiringSessionResolver(
            tokenProvider: { expiredToken },
            now: { now }
        )
        let sut = makeSUT(
            sessionResolver: resolver,
            authenticator: AuthenticatorStub(result: .failure(.network)),
            tokenCache: cache
        )

        let action = await sut.handle(.resolveSession)

        XCTAssertEqual(
            EffectOutcome(action: action, cachedToken: cache.read()),
            EffectOutcome(action: .resolutionFailed, cachedToken: nil)
        )
    }

    func test_handle_shouldWriteTokenAndReturnSessionObtained_onAuthenticateSuccess() async {
        let token = makeToken()
        let cache = InMemoryTokenCache()
        let sut = makeSUT(
            sessionResolver: SessionResolverStub(result: nil),
            authenticator: AuthenticatorStub(result: .success(token)),
            tokenCache: cache
        )

        let action = await sut.handle(.authenticate(username: "user", password: "pass"))

        XCTAssertEqual(
            EffectOutcome(action: action, cachedToken: cache.read()),
            EffectOutcome(action: .sessionObtained(token), cachedToken: token)
        )
    }

    func test_handle_shouldReturnAuthFailedAndKeepCacheEmpty_onAuthenticateFailure() async {
        let cache = InMemoryTokenCache()
        let sut = makeSUT(
            sessionResolver: SessionResolverStub(result: nil),
            authenticator: AuthenticatorStub(result: .failure(.invalidCredentials)),
            tokenCache: cache
        )

        let action = await sut.handle(.authenticate(username: "user", password: "pass"))

        XCTAssertEqual(
            EffectOutcome(action: action, cachedToken: cache.read()),
            EffectOutcome(action: .authFailed(.invalidCredentials), cachedToken: nil)
        )
    }

    func test_handle_shouldClearCacheAndReturnNil_onClearToken() async {
        let cache = InMemoryTokenCache()
        cache.write(makeToken())
        let sut = makeSUT(
            sessionResolver: SessionResolverStub(result: nil),
            authenticator: AuthenticatorStub(result: .failure(.network)),
            tokenCache: cache
        )

        let action = await sut.handle(.clearToken)

        XCTAssertEqual(
            EffectOutcome(action: action, cachedToken: cache.read()),
            EffectOutcome(action: nil, cachedToken: nil)
        )
    }

    // MARK: - Helpers

    private struct EffectOutcome: Equatable {
        let action: AuthAction?
        let cachedToken: Token?
    }

    private func makeSUT(
        sessionResolver: any SessionResolver,
        authenticator: any Authenticator,
        tokenCache: any TokenCache
    ) -> DefaultAuthEffectHandler {

        DefaultAuthEffectHandler(
            sessionResolver: sessionResolver,
            authenticator: authenticator,
            tokenCache: tokenCache
        )
    }

    private func makeToken(
        value: String = "token-value",
        expiresAt: Date = Date(timeIntervalSince1970: 2_000_000_000)
    ) -> Token {

        Token(value: value, expiresAt: expiresAt)
    }

    private actor SessionResolverStub: SessionResolver {
        private let result: Token?

        init(result: Token?) {
            self.result = result
        }

        func resolve() async -> Token? {
            result
        }
    }

    private actor AuthenticatorStub: Authenticator {
        private let result: AuthenticateResult

        init(result: AuthenticateResult) {
            self.result = result
        }

        func authenticate(username: String, password: String) async -> AuthenticateResult {
            result
        }
    }
}

final class InMemoryTokenCacheTests: XCTestCase {

    func test_read_shouldReturnNil_onEmptyCache() {
        let sut = InMemoryTokenCache()
        XCTAssertEqual(sut.read(), nil)
    }

    func test_read_shouldReturnWrittenToken_afterWrite() {
        let token = makeToken(value: "token-1")
        let sut = InMemoryTokenCache()

        sut.write(token)

        XCTAssertEqual(sut.read(), token)
    }

    func test_read_shouldReturnMostRecentToken_afterTwoWrites() {
        let first = makeToken(value: "token-1")
        let second = makeToken(value: "token-2")
        let sut = InMemoryTokenCache()
        sut.write(first)

        sut.write(second)

        XCTAssertEqual(sut.read(), second)
    }

    func test_read_shouldReturnNil_afterClear() {
        let sut = InMemoryTokenCache()
        sut.write(makeToken())

        sut.clear()

        XCTAssertEqual(sut.read(), nil)
    }

    // MARK: - Helpers

    private func makeToken(
        value: String = "token-value",
        expiresAt: Date = Date(timeIntervalSince1970: 2_000_000_000)
    ) -> Token {

        Token(value: value, expiresAt: expiresAt)
    }
}

final class ExpiringSessionResolverTests: XCTestCase {

    func test_resolve_shouldReturnToken_onFutureExpiration() async {
        let token = Token(value: "valid", expiresAt: Date(timeIntervalSince1970: 10_001))
        let sut = ExpiringSessionResolver(
            tokenProvider: { token },
            now: { Date(timeIntervalSince1970: 10_000) }
        )

        let result = await sut.resolve()

        XCTAssertEqual(result, token)
    }

    func test_resolve_shouldReturnNil_onPastExpiration() async {
        let token = Token(value: "expired", expiresAt: Date(timeIntervalSince1970: 9_999))
        let sut = ExpiringSessionResolver(
            tokenProvider: { token },
            now: { Date(timeIntervalSince1970: 10_000) }
        )

        let result = await sut.resolve()

        XCTAssertEqual(result, nil)
    }

    func test_resolve_shouldReturnNil_onMissingStoredToken() async {
        let sut = ExpiringSessionResolver(
            tokenProvider: { nil },
            now: { Date(timeIntervalSince1970: 10_000) }
        )

        let result = await sut.resolve()

        XCTAssertEqual(result, nil)
    }
}
