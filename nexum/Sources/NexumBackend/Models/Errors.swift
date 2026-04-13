import Foundation

public enum AddRepoError: Error, Equatable, Sendable {
    case duplicate(existingId: UUID)
}

public enum NotFoundError: Error, Equatable, Sendable {
    case notFound(id: UUID)
}

public enum URLValidationError: Error, Equatable, Sendable {
    case emptyInput
    case invalidURL
    case invalidScheme
    case invalidHost
    case invalidPath
    case queryOrFragmentNotAllowed
}

public enum AuthError: Error, Equatable, Sendable {
    case invalidCredentials
    case invalidToken
}
