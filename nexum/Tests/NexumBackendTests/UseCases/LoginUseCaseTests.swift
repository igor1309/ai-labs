@testable import NexumBackend
import Foundation
import XCTest

final class LoginUseCaseTests: XCTestCase {

    func test_execute_shouldReturnTokenResult_onValidCredentials() throws {
        let expectedResult = TokenResult(token: "token", expiresAt: Date(timeIntervalSince1970: 1000))
        let sut = LoginUseCase(
            credentialVerifier: StubCredentialVerifier(verifyResult: true),
            tokenIssuer: StubTokenIssuer(tokenResult: expectedResult)
        )

        let result = try sut.execute(username: "user", password: "password")

        XCTAssertEqual(result, expectedResult)
    }

    func test_execute_shouldThrowUnauthorized_onInvalidCredentials() {
        let sut = LoginUseCase(
            credentialVerifier: StubCredentialVerifier(verifyResult: false),
            tokenIssuer: StubTokenIssuer(tokenResult: TokenResult(token: "x", expiresAt: .distantFuture))
        )

        XCTAssertThrowsError(try sut.execute(username: "user", password: "wrong")) { error in
            XCTAssertEqual(error as? LoginUseCaseError, .unauthorized)
        }
    }
}
