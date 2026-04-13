public struct Identity: Equatable, Sendable {

    public let sub: String

    public init(sub: String) {

        self.sub = sub
    }
}
