import Foundation

public enum LoginUseCaseError: Error, Equatable, Sendable {
    case unauthorized
}

public enum AddRepoUseCaseError: Error, Equatable, Sendable {
    case duplicate(existingId: UUID)
    case invalidInput
}

public enum EditNoteUseCaseError: Error, Equatable, Sendable {
    case invalidId
    case notFound
}
