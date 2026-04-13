import Foundation

public struct AuthResponse: Codable, Equatable, Sendable {

    public let token: String
    public let expiresAt: Date

    public init(
        token: String,
        expiresAt: Date
    ) {

        self.token = token
        self.expiresAt = expiresAt
    }
}
