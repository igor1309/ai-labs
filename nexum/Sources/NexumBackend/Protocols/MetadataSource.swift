public protocol MetadataSource: Sendable {

    func fetch(url: String) async throws -> RepoMetadata
}
