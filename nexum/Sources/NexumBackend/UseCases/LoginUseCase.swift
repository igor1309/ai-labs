public struct LoginUseCase: Sendable {

    private let credentialVerifier: any CredentialVerifier
    private let tokenIssuer: any TokenIssuer

    public init(
        credentialVerifier: any CredentialVerifier,
        tokenIssuer: any TokenIssuer
    ) {

        self.credentialVerifier = credentialVerifier
        self.tokenIssuer = tokenIssuer
    }

    public func execute(
        username: String,
        password: String
    ) throws -> TokenResult {

        guard credentialVerifier.verify(username: username, password: password) else {
            throw LoginUseCaseError.unauthorized
        }

        return tokenIssuer.issue(username: username)
    }
}
