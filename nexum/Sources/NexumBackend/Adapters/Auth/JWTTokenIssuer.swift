import Foundation

public struct JWTTokenIssuer: TokenIssuer, Sendable {

    private let now: @Sendable () -> Date
    private let tokenCodec: JWTTokenCodec

    public init(
        secret: String,
        now: @escaping @Sendable () -> Date = Date.init
    ) {

        self.now = now
        self.tokenCodec = JWTTokenCodec(secret: secret)
    }

    public func issue(username: String) -> TokenResult {
        let issuedAt = now()
        let expiresAt = issuedAt.addingTimeInterval(24 * 60 * 60)
        let claims = JWTClaims(
            exp: Int(expiresAt.timeIntervalSince1970),
            sub: username
        )

        let token: String
        do {
            token = try tokenCodec.sign(claims: claims)
        } catch {
            preconditionFailure("JWT signing failed")
        }

        return TokenResult(token: token, expiresAt: expiresAt)
    }
}
