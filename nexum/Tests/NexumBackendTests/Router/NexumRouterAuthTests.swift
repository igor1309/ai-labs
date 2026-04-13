@testable import NexumBackend
import Foundation
import Hummingbird
import HummingbirdTesting
import HTTPTypes
import XCTest

final class NexumRouterAuthTests: XCTestCase {

    func test_guardedRoute_shouldProceed_onValidToken() async throws {
        let app = makeApplication(
            dependencies: makeDependencies(
                getRepos: {
                    SnapshotBlob(repos: [])
                },
                verifyAuth: { token in
                    guard token == "valid-token" else {
                        throw AuthError.invalidToken
                    }
                    return Identity(sub: "user")
                }
            )
        )

        try await app.test(TestingSetup.router) { client in
            var headers = HTTPFields()
            headers[.authorization] = "Bearer valid-token"
            try await client.execute(uri: "/repos", method: HTTPRequest.Method.get, headers: headers) { response in
                XCTAssertEqual(response.status, HTTPResponse.Status.ok)
            }
        }
    }

    func test_postRepos_shouldReturnUnauthorized_onMissingAuthorizationHeader() async throws {
        let app = makeApplication(dependencies: makeDependencies())

        try await app.test(TestingSetup.router) { client in
            var headers = HTTPFields()
            headers[.contentType] = "application/json"
            try await client.execute(
                uri: "/repos",
                method: HTTPRequest.Method.post,
                headers: headers,
                body: ByteBuffer(string: "{\"url\":\"https://github.com/owner/repo\",\"note\":\"note\"}")
            ) { response in
                XCTAssertEqual(response.status, HTTPResponse.Status.unauthorized)
            }
        }
    }

    func test_getRepos_shouldReturnUnauthorized_onMissingAuthorizationHeader() async throws {
        let app = makeApplication(dependencies: makeDependencies())

        try await app.test(TestingSetup.router) { client in
            try await client.execute(uri: "/repos", method: HTTPRequest.Method.get) { response in
                XCTAssertEqual(response.status, HTTPResponse.Status.unauthorized)
            }
        }
    }

    func test_patchNote_shouldReturnUnauthorized_onMissingAuthorizationHeader() async throws {
        let app = makeApplication(dependencies: makeDependencies())

        try await app.test(TestingSetup.router) { client in
            var headers = HTTPFields()
            headers[.contentType] = "application/json"
            try await client.execute(
                uri: "/repos/00000000-0000-0000-0000-000000000000/note",
                method: HTTPRequest.Method.patch,
                headers: headers,
                body: ByteBuffer(string: "{\"note\":\"new\"}")
            ) { response in
                XCTAssertEqual(response.status, HTTPResponse.Status.unauthorized)
            }
        }
    }

    func test_guardedRoute_shouldReturnUnauthorized_onExpiredToken() async throws {
        let app = makeApplication(
            dependencies: makeDependencies(
                verifyAuth: { _ in
                    throw AuthError.invalidToken
                }
            )
        )

        try await app.test(TestingSetup.router) { client in
            var headers = HTTPFields()
            headers[.authorization] = "Bearer expired-token"
            try await client.execute(uri: "/repos", method: HTTPRequest.Method.get, headers: headers) { response in
                XCTAssertEqual(response.status, HTTPResponse.Status.unauthorized)
            }
        }
    }

    func test_guardedRoute_shouldReturnUnauthorized_onMalformedAuthorizationHeader() async throws {
        let app = makeApplication(dependencies: makeDependencies())

        try await app.test(TestingSetup.router) { client in
            var headers = HTTPFields()
            headers[.authorization] = "Bearer"
            try await client.execute(uri: "/repos", method: HTTPRequest.Method.get, headers: headers) { response in
                XCTAssertEqual(response.status, HTTPResponse.Status.unauthorized)
            }
        }
    }

    func test_loginRoute_shouldBypassAuthVerification_onMissingAuthorizationHeader() async throws {
        let authSpy = AuthVerifierSpy()
        let app = makeApplication(
            dependencies: makeDependencies(
                login: { _, _ in
                    TokenResult(token: "token", expiresAt: Date(timeIntervalSince1970: 1000))
                },
                verifyAuth: { token in
                    await authSpy.record(token: token)
                    return Identity(sub: "user")
                }
            )
        )

        try await app.test(TestingSetup.router) { client in
            var headers = HTTPFields()
            headers[.contentType] = "application/json"
            try await client.execute(
                uri: "/auth/login",
                method: HTTPRequest.Method.post,
                headers: headers,
                body: ByteBuffer(string: "{\"username\":\"u\",\"password\":\"p\"}")
            ) { response in
                XCTAssertEqual(response.status, HTTPResponse.Status.ok)
            }
        }

        let callCount = await authSpy.callCount
        XCTAssertEqual(callCount, 0)
    }

    // MARK: - Helpers

    private func makeApplication(dependencies: NexumRouterDependencies) -> Application<RouterResponder<BasicRequestContext>> {
        let router = NexumRouterBuilder(dependencies: dependencies).build()
        return Application(router: router)
    }

    private func makeDependencies(
        addRepo: @escaping @Sendable (_ url: String, _ note: String) async throws -> SnapshotBlob = { _, _ in SnapshotBlob(repos: []) },
        editNote: @escaping @Sendable (_ id: UUID, _ note: String) async throws -> SnapshotBlob = { _, _ in SnapshotBlob(repos: []) },
        getRepos: @escaping @Sendable () async throws -> SnapshotBlob = { SnapshotBlob(repos: []) },
        login: @escaping @Sendable (_ username: String, _ password: String) async throws -> TokenResult = { _, _ in
            TokenResult(token: "token", expiresAt: Date(timeIntervalSince1970: 1000))
        },
        verifyAuth: @escaping @Sendable (_ token: String) async throws -> Identity = { _ in
            Identity(sub: "user")
        }
    ) -> NexumRouterDependencies {
        NexumRouterDependencies(
            addRepo: addRepo,
            editNote: editNote,
            getRepos: getRepos,
            login: login,
            verifyAuth: verifyAuth
        )
    }
}

actor AuthVerifierSpy {

    private(set) var callCount = 0

    func record(token: String) {
        _ = token
        callCount += 1
    }
}
