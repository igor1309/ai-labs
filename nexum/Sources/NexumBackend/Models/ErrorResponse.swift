import Foundation

public struct ErrorResponse: Codable, Equatable, Sendable {

    public let error: Bool
    public let code: String
    public let message: String

    public init(
        error: Bool = true,
        code: String,
        message: String
    ) {

        self.error = error
        self.code = code
        self.message = message
    }
}

public struct DuplicateErrorResponse: Codable, Equatable, Sendable {

    public let error: Bool
    public let code: String
    public let message: String
    public let existingId: UUID

    public init(
        error: Bool = true,
        code: String = "duplicate",
        message: String,
        existingId: UUID
    ) {

        self.error = error
        self.code = code
        self.message = message
        self.existingId = existingId
    }
}
