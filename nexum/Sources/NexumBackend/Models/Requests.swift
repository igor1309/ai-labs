import Foundation

public struct LoginRequest: Codable, Equatable, Sendable {

    public let username: String
    public let password: String

    public init(
        username: String,
        password: String
    ) {

        self.username = username
        self.password = password
    }
}

public struct AddRepoRequest: Codable, Equatable, Sendable {

    public let url: String
    public let note: String

    public init(
        url: String,
        note: String
    ) {

        self.url = url
        self.note = note
    }
}

public struct EditNoteRequest: Codable, Equatable, Sendable {

    public let note: String

    public init(note: String) {

        self.note = note
    }
}
