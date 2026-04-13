import Bcrypt

public struct BcryptCredentialVerifier: CredentialVerifier, Sendable {

    private let expectedPasswordHash: String
    private let expectedUsername: String

    public init(
        expectedUsername: String,
        expectedPasswordHash: String
    ) {

        self.expectedPasswordHash = expectedPasswordHash
        self.expectedUsername = expectedUsername
    }

    public func verify(username: String, password: String) -> Bool {
        guard !username.isEmpty, !password.isEmpty else {
            return false
        }

        guard username == expectedUsername else {
            return false
        }

        do {
            return try Bcrypt.verify(password: password, against: expectedPasswordHash)
        } catch {
            return false
        }
    }
}
