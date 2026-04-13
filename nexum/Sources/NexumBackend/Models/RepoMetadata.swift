public struct RepoMetadata: Codable, Equatable, Sendable {

    public let name: String
    public let stars: Int
    public let description: String?

    public init(
        name: String,
        stars: Int,
        description: String?
    ) {

        self.name = name
        self.stars = stars
        self.description = description
    }
}
