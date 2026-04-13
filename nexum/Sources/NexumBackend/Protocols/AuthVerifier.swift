public protocol AuthVerifier: Sendable {

    func verify(token: String) async throws -> Identity
}
