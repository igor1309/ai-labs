@testable import NexumBackend
import Bcrypt
import XCTest

final class BcryptCredentialVerifierTests: XCTestCase {

    func test_verify_shouldReturnTrue_onMatchingUsernameAndPassword() throws {
        let hash = try Bcrypt.hash(password: "secret", cost: 4)
        let sut = BcryptCredentialVerifier(expectedUsername: "user", expectedPasswordHash: hash)

        let result = sut.verify(username: "user", password: "secret")

        XCTAssertTrue(result)
    }

    func test_verify_shouldReturnFalse_onWrongPassword() throws {
        let hash = try Bcrypt.hash(password: "secret", cost: 4)
        let sut = BcryptCredentialVerifier(expectedUsername: "user", expectedPasswordHash: hash)

        let result = sut.verify(username: "user", password: "wrong")

        XCTAssertFalse(result)
    }

    func test_verify_shouldReturnFalse_onWrongUsername() throws {
        let hash = try Bcrypt.hash(password: "secret", cost: 4)
        let sut = BcryptCredentialVerifier(expectedUsername: "user", expectedPasswordHash: hash)

        let result = sut.verify(username: "other", password: "secret")

        XCTAssertFalse(result)
    }

    func test_verify_shouldReturnFalse_onEmptyUsername() throws {
        let hash = try Bcrypt.hash(password: "secret", cost: 4)
        let sut = BcryptCredentialVerifier(expectedUsername: "user", expectedPasswordHash: hash)

        let result = sut.verify(username: "", password: "secret")

        XCTAssertFalse(result)
    }

    func test_verify_shouldReturnFalse_onEmptyPassword() throws {
        let hash = try Bcrypt.hash(password: "secret", cost: 4)
        let sut = BcryptCredentialVerifier(expectedUsername: "user", expectedPasswordHash: hash)

        let result = sut.verify(username: "user", password: "")

        XCTAssertFalse(result)
    }
}
