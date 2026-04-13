@testable import NexumBackend
import Foundation
import XCTest

final class JWTAuthVerifierTests: XCTestCase {

    func test_verify_shouldReturnIdentity_onValidToken() async throws {
        let issuer = JWTTokenIssuer(secret: "secret", now: { Date(timeIntervalSince1970: 100) })
        let verifier = JWTAuthVerifier(secret: "secret", now: { Date(timeIntervalSince1970: 101) })

        let tokenResult = issuer.issue(username: "user")
        let identity = try await verifier.verify(token: tokenResult.token)

        XCTAssertEqual(identity, Identity(sub: "user"))
    }

    func test_verify_shouldThrowInvalidToken_onExpiredToken() async {
        let issuer = JWTTokenIssuer(secret: "secret", now: { Date(timeIntervalSince1970: 100) })
        let verifier = JWTAuthVerifier(secret: "secret", now: { Date(timeIntervalSince1970: 100 + (24 * 60 * 60) + 1) })

        let tokenResult = issuer.issue(username: "user")

        do {
            _ = try await verifier.verify(token: tokenResult.token)
            XCTFail("Expected invalid token")
        } catch {
            XCTAssertEqual(error as? AuthError, .invalidToken)
        }
    }

    func test_verify_shouldThrowInvalidToken_onMalformedToken() async {
        let verifier = JWTAuthVerifier(secret: "secret")

        do {
            _ = try await verifier.verify(token: "malformed")
            XCTFail("Expected invalid token")
        } catch {
            XCTAssertEqual(error as? AuthError, .invalidToken)
        }
    }

    func test_verify_shouldThrowInvalidToken_onInvalidSignature() async {
        let issuer = JWTTokenIssuer(secret: "secret-a", now: { Date(timeIntervalSince1970: 100) })
        let verifier = JWTAuthVerifier(secret: "secret-b", now: { Date(timeIntervalSince1970: 101) })

        let tokenResult = issuer.issue(username: "user")

        do {
            _ = try await verifier.verify(token: tokenResult.token)
            XCTFail("Expected invalid token")
        } catch {
            XCTAssertEqual(error as? AuthError, .invalidToken)
        }
    }
}
