public protocol CredentialVerifier: Sendable {

    func verify(username: String, password: String) -> Bool
}
