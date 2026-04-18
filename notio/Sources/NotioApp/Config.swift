import Foundation

public struct Config: Sendable {
    public let port: Int
    public let version: String
    public let webhookPath: String
    public let diagnosticMode: DiagnosticMode?

    public init(
        port: Int = 8080,
        version: String = "dev",
        webhookPath: String,
        diagnosticMode: DiagnosticMode? = nil
    ) {
        self.port = port
        self.version = version
        self.webhookPath = webhookPath
        self.diagnosticMode = diagnosticMode
    }

    public enum ConfigError: Error, Equatable {
        case missingWebhookPath
    }

    /// Reads config from the given environment dictionary.
    /// Throws ``ConfigError/missingWebhookPath`` when `NOTIO_WEBHOOK_PATH` is absent or empty.
    public static func fromEnvironment(_ env: [String: String] = ProcessInfo.processInfo.environment) throws -> Config {
        let webhookPath = env["NOTIO_WEBHOOK_PATH"] ?? ""
        guard !webhookPath.isEmpty else {
            throw ConfigError.missingWebhookPath
        }
        let port = Int(env["NOTIO_PORT"] ?? "") ?? 8080
        let version = env["NOTIO_VERSION"] ?? "dev"
        let diagnosticMode = DiagnosticMode(rawValue: env["NOTIO_DIAGNOSTIC_MODE"] ?? "")
        return Config(port: port, version: version, webhookPath: webhookPath, diagnosticMode: diagnosticMode)
    }
}

public enum DiagnosticMode: Equatable, Sendable {
    case ack
    case inspect

    public init?(rawValue: String) {
        switch rawValue {
        case "ack": self = .ack
        case "inspect": self = .inspect
        default: return nil
        }
    }
}
