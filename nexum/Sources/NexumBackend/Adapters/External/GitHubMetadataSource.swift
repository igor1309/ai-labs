import Foundation

public struct GitHubMetadataSource: MetadataSource, Sendable {

    private let githubToken: String?
    private let session: URLSession

    public init(
        githubToken: String?,
        session: URLSession = .shared
    ) {

        self.githubToken = githubToken
        self.session = session
    }

    public func fetch(url: String) async throws -> RepoMetadata {
        let normalizedUrlResult = normalizeUrl(url)
        guard case let .success(normalizedUrl) = normalizedUrlResult else {
            throw URLValidationError.invalidURL
        }

        guard let parts = URL(string: normalizedUrl)?.pathComponents else {
            throw URLValidationError.invalidPath
        }

        guard parts.count >= 3 else {
            throw URLValidationError.invalidPath
        }

        let owner = parts[1]
        let repo = parts[2]
        guard let apiUrl = URL(string: "https://api.github.com/repos/\(owner)/\(repo)") else {
            throw URLValidationError.invalidURL
        }

        var request = URLRequest(url: apiUrl)
        request.httpMethod = "GET"
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.setValue("nexum-backend", forHTTPHeaderField: "User-Agent")
        if let githubToken, !githubToken.isEmpty {
            request.setValue("Bearer \(githubToken)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode)
        else {
            throw NSError(domain: "GitHubMetadataSource", code: 1)
        }

        let decoded = try JSONDecoder().decode(GitHubRepoResponse.self, from: data)
        return RepoMetadata(
            name: decoded.name,
            stars: decoded.stargazersCount,
            description: decoded.description
        )
    }
}

private struct GitHubRepoResponse: Decodable {

    let description: String?
    let name: String
    let stargazersCount: Int

    enum CodingKeys: String, CodingKey {
        case description
        case name
        case stargazersCount = "stargazers_count"
    }
}
