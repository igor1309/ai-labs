import Foundation

public struct JWTAuthVerifier: AuthVerifier, Sendable {

    private let now: @Sendable () -> Date
    private let tokenCodec: JWTTokenCodec

    public init(
        secret: String,
        now: @escaping @Sendable () -> Date = Date.init
    ) {

        self.now = now
        self.tokenCodec = JWTTokenCodec(secret: secret)
    }

    public func verify(token: String) async throws -> Identity {
        let claims: JWTClaims
        do {
            claims = try tokenCodec.verify(token)
        } catch {
            throw AuthError.invalidToken
        }

        let currentTimestamp = Int(now().timeIntervalSince1970)
        guard claims.exp > currentTimestamp else {
            throw AuthError.invalidToken
        }

        return Identity(sub: claims.sub)
    }
}
