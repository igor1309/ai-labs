public protocol TokenIssuer: Sendable {

    func issue(username: String) -> TokenResult
}
