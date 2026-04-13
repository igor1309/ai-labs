import Foundation

struct NexumServerConfiguration: Equatable {

    let authPasswordHash: String
    let authUsername: String
    let databasePath: String
    let githubToken: String?
    let jwtSecret: String
    let port: Int

    static func fromEnvironment(_ environment: [String: String]) throws -> NexumServerConfiguration {
        let databasePath = try requiredValue(named: "DATABASE_PATH", environment: environment)
        let jwtSecret = try requiredValue(named: "JWT_SECRET", environment: environment)
        let authUsername = try requiredValue(named: "AUTH_USERNAME", environment: environment)
        let authPasswordHash = try requiredValue(named: "AUTH_PASSWORD_HASH", environment: environment)

        let port: Int
        if let rawPort = environment["PORT"] {
            let trimmed = rawPort.trimmingCharacters(in: .whitespacesAndNewlines)
            guard let parsedPort = Int(trimmed), parsedPort > 0 else {
                throw NexumServerConfigurationError.invalidPort
            }
            port = parsedPort
        } else {
            port = 8080
        }

        let githubToken = environment["GITHUB_TOKEN"]?.trimmingCharacters(in: .whitespacesAndNewlines)
        return NexumServerConfiguration(
            authPasswordHash: authPasswordHash,
            authUsername: authUsername,
            databasePath: databasePath,
            githubToken: githubToken?.isEmpty == true ? nil : githubToken,
            jwtSecret: jwtSecret,
            port: port
        )
    }

    static func fromProcessEnvironment() throws -> NexumServerConfiguration {
        try fromEnvironment(ProcessInfo.processInfo.environment)
    }

    private static func requiredValue(named name: String, environment: [String: String]) throws -> String {
        guard let value = environment[name]?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else {
            throw NexumServerConfigurationError.missingRequiredEnvironmentVariable(name)
        }
        return value
    }
}

enum NexumServerConfigurationError: Error, Equatable {
    case invalidPort
    case missingRequiredEnvironmentVariable(String)
}
