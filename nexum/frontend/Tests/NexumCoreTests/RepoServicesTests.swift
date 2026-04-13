import Foundation
@testable import NexumCore
import XCTest

final class RepoServicesTests: XCTestCase {

    func test_getRepos_shouldReturnSuccess_on200WithValidSnapshot() async throws {
        let repo = makeRepoEntry()
        let spy = HTTPClientSpy(results: [.success(statusCode: 200, data: try makeSnapshotData(repos: [repo]))])
        let sut = GetReposService(httpClient: spy)

        let result = await sut.getRepos()

        XCTAssertEqual(result, .success([repo]))
    }

    func test_getRepos_shouldReturnUnexpectedResponseFailure_on200WithMalformedJSON() async {
        let spy = HTTPClientSpy(results: [.success(statusCode: 200, data: Data("malformed".utf8))])
        let sut = GetReposService(httpClient: spy)

        let result = await sut.getRepos()

        XCTAssertEqual(result, .failure(.unexpectedResponse))
    }

    func test_getRepos_shouldReturnUnauthorizedFailure_on401Response() async {
        let spy = HTTPClientSpy(results: [.success(statusCode: 401, data: Data())])
        let sut = GetReposService(httpClient: spy)

        let result = await sut.getRepos()

        XCTAssertEqual(result, .failure(.unauthorized))
    }

    func test_getRepos_shouldReturnServerErrorFailure_on500WithErrorEnvelope() async throws {
        let errorMessage = "internal failure"
        let spy = HTTPClientSpy(results: [.success(statusCode: 500, data: try makeErrorData(message: errorMessage))])
        let sut = GetReposService(httpClient: spy)

        let result = await sut.getRepos()

        XCTAssertEqual(result, .failure(.serverError(errorMessage)))
    }

    func test_getRepos_shouldReturnNetworkFailure_onHTTPClientNetworkError() async {
        let spy = HTTPClientSpy(results: [.failure(.network(MockNetworkError()))])
        let sut = GetReposService(httpClient: spy)

        let result = await sut.getRepos()

        XCTAssertEqual(result, .failure(.network))
    }

    func test_getRepos_shouldSendGETRequest_onServiceCall() async throws {
        let spy = HTTPClientSpy(results: [.success(statusCode: 200, data: try makeSnapshotData(repos: []))])
        let sut = GetReposService(httpClient: spy)

        _ = await sut.getRepos()
        let requests = await spy.requests()
        let request = try XCTUnwrap(requests.first)

        XCTAssertEqual(try makeRequestProjection(request), RequestProjection(
            method: .get,
            path: "/repos",
            headers: [:],
            body: nil
        ))
    }

    func test_addRepo_shouldReturnSuccess_on201WithValidSnapshot() async throws {
        let repo = makeRepoEntry()
        let spy = HTTPClientSpy(results: [.success(statusCode: 201, data: try makeSnapshotData(repos: [repo]))])
        let sut = AddRepoService(httpClient: spy)

        let result = await sut.addRepo(url: "https://github.com/apple/swift", note: "swift repo")

        XCTAssertEqual(result, .success([repo]))
    }

    func test_addRepo_shouldReturnDuplicate_on409WithValidDuplicateError() async throws {
        let existingId = UUID()
        let spy = HTTPClientSpy(results: [.success(statusCode: 409, data: try makeDuplicateErrorData(existingId: existingId))])
        let sut = AddRepoService(httpClient: spy)

        let result = await sut.addRepo(url: "https://github.com/apple/swift", note: "swift repo")

        XCTAssertEqual(result, .duplicate(existingId: existingId))
    }

    func test_addRepo_shouldReturnUnexpectedResponseFailure_on409WithMalformedDuplicateError() async {
        let spy = HTTPClientSpy(results: [.success(statusCode: 409, data: Data("malformed".utf8))])
        let sut = AddRepoService(httpClient: spy)

        let result = await sut.addRepo(url: "https://github.com/apple/swift", note: "swift repo")

        XCTAssertEqual(result, .failure(.unexpectedResponse))
    }

    func test_addRepo_shouldReturnInvalidInputFailure_on400Response() async {
        let spy = HTTPClientSpy(results: [.success(statusCode: 400, data: Data())])
        let sut = AddRepoService(httpClient: spy)

        let result = await sut.addRepo(url: "https://github.com/apple/swift", note: "swift repo")

        XCTAssertEqual(result, .failure(.invalidInput))
    }

    func test_addRepo_shouldReturnUnauthorizedFailure_on401Response() async {
        let spy = HTTPClientSpy(results: [.success(statusCode: 401, data: Data())])
        let sut = AddRepoService(httpClient: spy)

        let result = await sut.addRepo(url: "https://github.com/apple/swift", note: "swift repo")

        XCTAssertEqual(result, .failure(.unauthorized))
    }

    func test_addRepo_shouldReturnUnexpectedResponseFailure_on201WithMalformedSnapshot() async {
        let spy = HTTPClientSpy(results: [.success(statusCode: 201, data: Data("malformed".utf8))])
        let sut = AddRepoService(httpClient: spy)

        let result = await sut.addRepo(url: "https://github.com/apple/swift", note: "swift repo")

        XCTAssertEqual(result, .failure(.unexpectedResponse))
    }

    func test_addRepo_shouldReturnNetworkFailure_onHTTPClientNetworkError() async {
        let spy = HTTPClientSpy(results: [.failure(.network(MockNetworkError()))])
        let sut = AddRepoService(httpClient: spy)

        let result = await sut.addRepo(url: "https://github.com/apple/swift", note: "swift repo")

        XCTAssertEqual(result, .failure(.network))
    }

    func test_addRepo_shouldSendPOSTRequestWithJSONBody_onServiceCall() async throws {
        let spy = HTTPClientSpy(results: [.success(statusCode: 201, data: try makeSnapshotData(repos: []))])
        let sut = AddRepoService(httpClient: spy)

        _ = await sut.addRepo(url: "https://github.com/apple/swift", note: "swift repo")
        let requests = await spy.requests()
        let request = try XCTUnwrap(requests.first)

        XCTAssertEqual(try makeRequestProjection(request), RequestProjection(
            method: .post,
            path: "/repos",
            headers: ["Content-Type": "application/json"],
            body: [
                "note": "swift repo",
                "repoUrl": "https://github.com/apple/swift",
            ]
        ))
    }

    func test_editNote_shouldReturnSuccess_on200WithValidSnapshot() async throws {
        let repo = makeRepoEntry()
        let spy = HTTPClientSpy(results: [.success(statusCode: 200, data: try makeSnapshotData(repos: [repo]))])
        let sut = EditNoteService(httpClient: spy)

        let result = await sut.editNote(id: UUID(), note: "updated note")

        XCTAssertEqual(result, .success([repo]))
    }

    func test_editNote_shouldReturnUnexpectedResponseFailure_on200WithMalformedSnapshot() async {
        let spy = HTTPClientSpy(results: [.success(statusCode: 200, data: Data("malformed".utf8))])
        let sut = EditNoteService(httpClient: spy)

        let result = await sut.editNote(id: UUID(), note: "updated note")

        XCTAssertEqual(result, .failure(.unexpectedResponse))
    }

    func test_editNote_shouldReturnNotFoundFailure_on404Response() async {
        let spy = HTTPClientSpy(results: [.success(statusCode: 404, data: Data())])
        let sut = EditNoteService(httpClient: spy)

        let result = await sut.editNote(id: UUID(), note: "updated note")

        XCTAssertEqual(result, .failure(.notFound))
    }

    func test_editNote_shouldReturnUnauthorizedFailure_on401Response() async {
        let spy = HTTPClientSpy(results: [.success(statusCode: 401, data: Data())])
        let sut = EditNoteService(httpClient: spy)

        let result = await sut.editNote(id: UUID(), note: "updated note")

        XCTAssertEqual(result, .failure(.unauthorized))
    }

    func test_editNote_shouldReturnNetworkFailure_onHTTPClientNetworkError() async {
        let spy = HTTPClientSpy(results: [.failure(.network(MockNetworkError()))])
        let sut = EditNoteService(httpClient: spy)

        let result = await sut.editNote(id: UUID(), note: "updated note")

        XCTAssertEqual(result, .failure(.network))
    }

    func test_editNote_shouldSendPATCHRequestWithLowercaseUUIDPathAndJSONBody_onServiceCall() async throws {
        let repositoryId = try XCTUnwrap(UUID(uuidString: "A3D39D89-4B57-4363-AC6D-BBA3D8AC82EA"))
        let spy = HTTPClientSpy(results: [.success(statusCode: 200, data: try makeSnapshotData(repos: []))])
        let sut = EditNoteService(httpClient: spy)

        _ = await sut.editNote(id: repositoryId, note: "updated note")
        let requests = await spy.requests()
        let request = try XCTUnwrap(requests.first)

        XCTAssertEqual(try makeRequestProjection(request), RequestProjection(
            method: .patch,
            path: "/repos/a3d39d89-4b57-4363-ac6d-bba3d8ac82ea/note",
            headers: ["Content-Type": "application/json"],
            body: ["note": "updated note"]
        ))
    }

    private struct MockNetworkError: Error, Sendable {}

    private struct RequestProjection: Equatable {
        let method: HTTPMethod
        let path: String
        let headers: [String: String]
        let body: [String: String]?
    }

    private actor HTTPClientSpy: HTTPClient {
        private var results: [HTTPResult]
        private var capturedRequests: [HTTPRequest]

        init(results: [HTTPResult]) {
            self.results = results
            capturedRequests = []
        }

        func send(_ request: HTTPRequest) async -> HTTPResult {

            capturedRequests.append(request)

            if results.isEmpty {
                return .failure(.invalidResponse)
            }

            return results.removeFirst()
        }

        func requests() -> [HTTPRequest] {

            capturedRequests
        }
    }

    private struct SnapshotData: Encodable {
        let repos: [RepoData]
    }

    private struct RepoData: Encodable {
        let id: UUID
        let repoUrl: String
        let name: String?
        let stars: Int?
        let description: String?
        let note: String
        let addedAt: Date
    }

    private struct DuplicateErrorData: Encodable {
        let error: Bool
        let code: String
        let message: String
        let existingId: UUID
    }

    private struct ErrorData: Encodable {
        let error: Bool
        let code: String
        let message: String
    }

    private func makeSnapshotData(repos: [RepoEntry]) throws -> Data {

        let snapshot = SnapshotData(repos: repos.map {
            RepoData(
                id: $0.id,
                repoUrl: $0.repoUrl,
                name: $0.name,
                stars: $0.stars,
                description: $0.description,
                note: $0.note,
                addedAt: $0.addedAt
            )
        })
        return try makeJSONEncoder().encode(snapshot)
    }

    private func makeDuplicateErrorData(existingId: UUID) throws -> Data {

        try makeJSONEncoder().encode(DuplicateErrorData(
            error: true,
            code: "duplicate",
            message: "Repo already exists",
            existingId: existingId
        ))
    }

    private func makeErrorData(message: String) throws -> Data {

        try makeJSONEncoder().encode(ErrorData(
            error: true,
            code: "internal_error",
            message: message
        ))
    }

    private func makeRequestProjection(_ request: HTTPRequest) throws -> RequestProjection {

        RequestProjection(
            method: request.method,
            path: request.path,
            headers: request.headers,
            body: try decodeStringDictionary(from: request.body)
        )
    }

    private func decodeStringDictionary(from body: Data?) throws -> [String: String]? {

        switch body {
        case .none:
            return nil
        case .some(let data):
            let jsonObject = try JSONSerialization.jsonObject(with: data)
            return try XCTUnwrap(jsonObject as? [String: String])
        }
    }

    private func makeJSONEncoder() -> JSONEncoder {

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }

    private func makeRepoEntry(
        id: UUID = UUID(),
        repoUrl: String = "https://github.com/apple/swift",
        name: String? = "swift",
        stars: Int? = 123,
        description: String? = "swift language",
        note: String = "note",
        addedAt: Date = Date(timeIntervalSince1970: 1_234)
    ) -> RepoEntry {

        RepoEntry(
            id: id,
            repoUrl: repoUrl,
            name: name,
            stars: stars,
            description: description,
            note: note,
            addedAt: addedAt
        )
    }
}
