import Foundation

public protocol HTTPClient: Sendable {
    func send(_ request: HTTPRequest) async -> HTTPResult
}

public struct HTTPRequest: Equatable, Sendable {
    public var method: HTTPMethod
    public var path: String
    public var body: Data?
    public var headers: [String: String]

    public init(
        method: HTTPMethod,
        path: String,
        body: Data?,
        headers: [String: String] = [:]
    ) {
        self.method = method
        self.path = path
        self.body = body
        self.headers = headers
    }
}

public enum HTTPMethod: Equatable, Sendable {
    case get
    case post
    case patch
}

public enum HTTPResult: Sendable {
    case success(statusCode: Int, data: Data)
    case failure(HTTPClientError)
}

public enum HTTPClientError: Sendable {
    case network(any Error & Sendable)
    case invalidResponse
}

public struct GetReposService: GetRepos {
    private let httpClient: any HTTPClient

    public init(httpClient: any HTTPClient) {
        self.httpClient = httpClient
    }

    public func getRepos() async -> GetReposResult {

        let request = HTTPRequest(
            method: .get,
            path: "/repos",
            body: nil
        )

        switch await httpClient.send(request) {
        case .success(let statusCode, let data):
            switch statusCode {
            case 200:
                guard let snapshot = decodeSnapshot(from: data) else {
                    return .failure(.unexpectedResponse)
                }
                return .success(snapshot.repos)
            case 401:
                return .failure(.unauthorized)
            case 400...599:
                return .failure(.serverError(decodeServerErrorMessage(from: data)))
            default:
                return .failure(.unexpectedResponse)
            }
        case .failure:
            return .failure(.network)
        }
    }
}

public struct AddRepoService: AddRepo {
    private let httpClient: any HTTPClient

    public init(httpClient: any HTTPClient) {
        self.httpClient = httpClient
    }

    public func addRepo(url: String, note: String) async -> AddRepoResult {

        guard let body = encodeBody(AddRepoRequest(repoUrl: url, note: note)) else {
            return .failure(.unexpectedResponse)
        }

        let request = HTTPRequest(
            method: .post,
            path: "/repos",
            body: body,
            headers: [
                "Content-Type": "application/json",
            ]
        )

        switch await httpClient.send(request) {
        case .success(let statusCode, let data):
            switch statusCode {
            case 201:
                guard let snapshot = decodeSnapshot(from: data) else {
                    return .failure(.unexpectedResponse)
                }
                return .success(snapshot.repos)
            case 409:
                guard let duplicate = decodeDuplicateError(from: data) else {
                    return .failure(.unexpectedResponse)
                }
                return .duplicate(existingId: duplicate.existingId)
            case 400:
                return .failure(.invalidInput)
            case 401:
                return .failure(.unauthorized)
            case 400...599:
                return .failure(.serverError(decodeServerErrorMessage(from: data)))
            default:
                return .failure(.unexpectedResponse)
            }
        case .failure:
            return .failure(.network)
        }
    }
}

public struct EditNoteService: EditNote {
    private let httpClient: any HTTPClient

    public init(httpClient: any HTTPClient) {
        self.httpClient = httpClient
    }

    public func editNote(id: UUID, note: String) async -> EditNoteResult {

        guard let body = encodeBody(EditNoteRequest(note: note)) else {
            return .failure(.unexpectedResponse)
        }

        let request = HTTPRequest(
            method: .patch,
            path: "/repos/\(id.uuidString.lowercased())/note",
            body: body,
            headers: [
                "Content-Type": "application/json",
            ]
        )

        switch await httpClient.send(request) {
        case .success(let statusCode, let data):
            switch statusCode {
            case 200:
                guard let snapshot = decodeSnapshot(from: data) else {
                    return .failure(.unexpectedResponse)
                }
                return .success(snapshot.repos)
            case 404:
                return .failure(.notFound)
            case 401:
                return .failure(.unauthorized)
            case 400...599:
                return .failure(.serverError(decodeServerErrorMessage(from: data)))
            default:
                return .failure(.unexpectedResponse)
            }
        case .failure:
            return .failure(.network)
        }
    }
}

private struct SnapshotResponse: Decodable {
    let repos: [RepoEntry]
}

private struct DuplicateErrorResponse: Decodable {
    let existingId: UUID
}

private struct ErrorResponse: Decodable {
    let message: String
}

private struct AddRepoRequest: Encodable {
    let repoUrl: String
    let note: String
}

private struct EditNoteRequest: Encodable {
    let note: String
}

extension RepoEntry: Decodable {
    private enum CodingKeys: String, CodingKey {
        case id
        case repoUrl
        case name
        case stars
        case description
        case note
        case addedAt
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        self.init(
            id: try container.decode(UUID.self, forKey: .id),
            repoUrl: try container.decode(String.self, forKey: .repoUrl),
            name: try container.decodeIfPresent(String.self, forKey: .name),
            stars: try container.decodeIfPresent(Int.self, forKey: .stars),
            description: try container.decodeIfPresent(String.self, forKey: .description),
            note: try container.decode(String.self, forKey: .note),
            addedAt: try container.decode(Date.self, forKey: .addedAt)
        )
    }
}

private func decodeSnapshot(from data: Data) -> SnapshotResponse? {

    try? makeJSONDecoder().decode(SnapshotResponse.self, from: data)
}

private func decodeDuplicateError(from data: Data) -> DuplicateErrorResponse? {

    try? makeJSONDecoder().decode(DuplicateErrorResponse.self, from: data)
}

private func decodeServerErrorMessage(from data: Data) -> String {

    (try? makeJSONDecoder().decode(ErrorResponse.self, from: data).message) ?? ""
}

private func encodeBody(_ body: some Encodable) -> Data? {

    try? JSONEncoder().encode(body)
}

private func makeJSONDecoder() -> JSONDecoder {

    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    return decoder
}
