import Foundation

public func normalizeUrl(_ input: String) -> Result<String, URLValidationError> {
    let trimmedInput = input.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedInput.isEmpty else {
        return .failure(.emptyInput)
    }

    guard let components = URLComponents(string: trimmedInput) else {
        return .failure(.invalidURL)
    }

    guard components.query == nil, components.fragment == nil else {
        return .failure(.queryOrFragmentNotAllowed)
    }

    guard let scheme = components.scheme else {
        return .failure(.invalidURL)
    }

    guard scheme.lowercased() == "https" else {
        return .failure(.invalidScheme)
    }

    guard let host = components.host else {
        return .failure(.invalidURL)
    }

    guard host.lowercased() == "github.com" else {
        return .failure(.invalidHost)
    }

    var normalizedPath = components.path
    while normalizedPath.count > 1, normalizedPath.hasSuffix("/") {
        normalizedPath.removeLast()
    }

    let pathSegments = Array(normalizedPath.split(separator: "/", omittingEmptySubsequences: false).dropFirst())
    guard pathSegments.count == 2 else {
        return .failure(.invalidPath)
    }

    let owner = String(pathSegments[0])
    var repo = String(pathSegments[1])

    guard !owner.isEmpty, !repo.isEmpty else {
        return .failure(.invalidPath)
    }

    if repo.hasSuffix(".git") {
        repo.removeLast(4)
    }

    guard !repo.isEmpty else {
        return .failure(.invalidPath)
    }

    return .success("https://github.com/\(owner)/\(repo)")
}
