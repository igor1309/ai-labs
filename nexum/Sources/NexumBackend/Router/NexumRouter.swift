import Foundation
import Hummingbird

public struct NexumRouterDependencies: Sendable {

    public let addRepo: @Sendable (_ url: String, _ note: String) async throws -> SnapshotBlob
    public let editNote: @Sendable (_ id: UUID, _ note: String) async throws -> SnapshotBlob
    public let getRepos: @Sendable () async throws -> SnapshotBlob
    public let login: @Sendable (_ username: String, _ password: String) async throws -> TokenResult
    public let verifyAuth: @Sendable (_ token: String) async throws -> Identity

    public init(
        addRepo: @escaping @Sendable (_ url: String, _ note: String) async throws -> SnapshotBlob,
        editNote: @escaping @Sendable (_ id: UUID, _ note: String) async throws -> SnapshotBlob,
        getRepos: @escaping @Sendable () async throws -> SnapshotBlob,
        login: @escaping @Sendable (_ username: String, _ password: String) async throws -> TokenResult,
        verifyAuth: @escaping @Sendable (_ token: String) async throws -> Identity
    ) {

        self.addRepo = addRepo
        self.editNote = editNote
        self.getRepos = getRepos
        self.login = login
        self.verifyAuth = verifyAuth
    }

    public init(
        loginUseCase: LoginUseCase,
        addRepoUseCase: AddRepoUseCase,
        getReposUseCase: GetReposUseCase,
        editNoteUseCase: EditNoteUseCase,
        authVerifier: any AuthVerifier
    ) {

        self.addRepo = { url, note in
            try await addRepoUseCase.execute(url: url, note: note)
        }
        self.editNote = { id, note in
            try await editNoteUseCase.execute(id: id, note: note)
        }
        self.getRepos = {
            try await getReposUseCase.execute()
        }
        self.login = { username, password in
            try loginUseCase.execute(username: username, password: password)
        }
        self.verifyAuth = { token in
            try await authVerifier.verify(token: token)
        }
    }
}

public struct NexumRouterBuilder: Sendable {

    private let dependencies: NexumRouterDependencies

    public init(dependencies: NexumRouterDependencies) {

        self.dependencies = dependencies
    }

    public func build() -> Router<BasicRequestContext> {
        let router = Router<BasicRequestContext>()

        router.post("/auth/login") { request, context -> Response in
            do {
                let loginRequest = try await request.decode(as: LoginRequest.self, context: context)
                let tokenResult = try await dependencies.login(loginRequest.username, loginRequest.password)
                let response = AuthResponse(
                    token: tokenResult.token,
                    expiresAt: tokenResult.expiresAt
                )
                return try makeJSONResponse(
                    payload: response,
                    status: .ok
                )
            } catch let error as LoginUseCaseError {
                if error == .unauthorized {
                    return try makeJSONResponse(
                        payload: ErrorResponse(code: "unauthorized", message: "Invalid credentials"),
                        status: .unauthorized
                    )
                }
                return makeInternalErrorResponse()
            } catch {
                return makeInternalErrorResponse()
            }
        }

        router.post("/repos") { request, context -> Response in
            do {
                try await authorize(request: request)
                let body = try await request.decode(as: AddRepoRequest.self, context: context)
                let snapshot = try await dependencies.addRepo(body.url, body.note)
                return try makeJSONResponse(payload: snapshot, status: .created)
            } catch {
                return try mapRouteError(error)
            }
        }

        router.get("/repos") { request, _ -> Response in
            do {
                try await authorize(request: request)
                let snapshot = try await dependencies.getRepos()
                return try makeJSONResponse(payload: snapshot, status: .ok)
            } catch {
                return try mapRouteError(error)
            }
        }

        router.patch("/repos/{id}/note") { request, context -> Response in
            do {
                try await authorize(request: request)
                let id = try context.parameters.require("id", as: UUID.self)
                let body = try await request.decode(as: EditNoteRequest.self, context: context)
                let snapshot = try await dependencies.editNote(id, body.note)
                return try makeJSONResponse(payload: snapshot, status: .ok)
            } catch {
                return try mapRouteError(error)
            }
        }

        return router
    }

    private func authorize(request: Request) async throws {
        guard let authorization = request.headers[.authorization] else {
            throw AuthError.invalidToken
        }

        guard authorization.hasPrefix("Bearer ") else {
            throw AuthError.invalidToken
        }

        let token = String(authorization.dropFirst("Bearer ".count)).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !token.isEmpty else {
            throw AuthError.invalidToken
        }

        _ = try await dependencies.verifyAuth(token)
    }

    private func makeJSONResponse(
        payload: some Encodable,
        status: HTTPResponse.Status
    ) throws -> Response {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(payload)

        var headers = HTTPFields()
        headers[.contentLength] = "\(data.count)"
        headers[.contentType] = "application/json; charset=utf-8"

        return Response(
            status: status,
            headers: headers,
            body: .init(byteBuffer: ByteBuffer(data: data))
        )
    }

    private func makeInternalErrorResponse() -> Response {
        let payload = ErrorResponse(
            code: "internal_error",
            message: "Internal server error"
        )

        let encoder = JSONEncoder()
        let data = (try? encoder.encode(payload)) ?? Data("{}".utf8)

        var headers = HTTPFields()
        headers[.contentLength] = "\(data.count)"
        headers[.contentType] = "application/json; charset=utf-8"

        return Response(
            status: .internalServerError,
            headers: headers,
            body: .init(byteBuffer: ByteBuffer(data: data))
        )
    }

    private func mapRouteError(_ error: Error) throws -> Response {
        if let authError = error as? AuthError, authError == .invalidToken {
            return try makeJSONResponse(
                payload: ErrorResponse(code: "unauthorized", message: "Unauthorized"),
                status: .unauthorized
            )
        }

        if error is HTTPError {
            return try makeJSONResponse(
                payload: ErrorResponse(code: "invalid_input", message: "Invalid request"),
                status: .badRequest
            )
        }

        if let addRepoError = error as? AddRepoUseCaseError {
            switch addRepoError {
            case let .duplicate(existingId):
                return try makeJSONResponse(
                    payload: DuplicateErrorResponse(message: "Repository already exists", existingId: existingId),
                    status: .conflict
                )
            case .invalidInput:
                return try makeJSONResponse(
                    payload: ErrorResponse(code: "invalid_input", message: "Invalid repository URL"),
                    status: .badRequest
                )
            }
        }

        if let editNoteError = error as? EditNoteUseCaseError, editNoteError == .notFound {
            return try makeJSONResponse(
                payload: ErrorResponse(code: "not_found", message: "Repository not found"),
                status: .notFound
            )
        }

        return makeInternalErrorResponse()
    }
}
