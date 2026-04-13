@testable import NexumBackend
import Foundation
import XCTest

final class JWTTokenIssuerTests: XCTestCase {

    func test_issue_shouldSetExpiryTo24Hours_onIssue() throws {
        let now = Date(timeIntervalSince1970: 100)
        let sut = JWTTokenIssuer(secret: "secret", now: { now })

        let tokenResult = sut.issue(username: "user")

        XCTAssertEqual(tokenResult.expiresAt, now.addingTimeInterval(24 * 60 * 60))
    }

    func test_issue_shouldEncodeSubjectClaim_onIssue() throws {
        let sut = JWTTokenIssuer(secret: "secret", now: { Date(timeIntervalSince1970: 100) })
        let codec = JWTTokenCodec(secret: "secret")

        let tokenResult = sut.issue(username: "user")
        let claims = try codec.verify(tokenResult.token)

        XCTAssertEqual(claims.sub, "user")
    }
}
