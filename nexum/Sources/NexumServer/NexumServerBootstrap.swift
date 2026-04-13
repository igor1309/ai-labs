import Hummingbird
import NexumBackend
import SQLite

enum NexumServerBootstrap {

    static func makeApplication(
        configuration: NexumServerConfiguration
    ) throws -> Application<RouterResponder<BasicRequestContext>> {
        let connection = try Connection(configuration.databasePath)
        let repoStore = try SQLiteRepoStore(connection: connection)
        let snapshotStore = try SQLiteSnapshotStore(connection: connection)
        let metadataSource = GitHubMetadataSource(githubToken: configuration.githubToken)
        let credentialVerifier = BcryptCredentialVerifier(
            expectedUsername: configuration.authUsername,
            expectedPasswordHash: configuration.authPasswordHash
        )
        let tokenIssuer = JWTTokenIssuer(secret: configuration.jwtSecret)
        let authVerifier = JWTAuthVerifier(secret: configuration.jwtSecret)

        let dependencies = NexumRouterDependencies(
            loginUseCase: LoginUseCase(
                credentialVerifier: credentialVerifier,
                tokenIssuer: tokenIssuer
            ),
            addRepoUseCase: AddRepoUseCase(
                repoStore: repoStore,
                metadataSource: metadataSource,
                snapshotStore: snapshotStore
            ),
            getReposUseCase: GetReposUseCase(snapshotStore: snapshotStore),
            editNoteUseCase: EditNoteUseCase(
                repoStore: repoStore,
                metadataSource: metadataSource,
                snapshotStore: snapshotStore
            ),
            authVerifier: authVerifier
        )

        let router = NexumRouterBuilder(dependencies: dependencies).build()
        let appConfiguration = ApplicationConfiguration(
            address: .hostname("0.0.0.0", port: configuration.port)
        )

        return Application(
            router: router,
            configuration: appConfiguration
        )
    }
}
