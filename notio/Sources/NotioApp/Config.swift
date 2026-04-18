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

    public static func fromEnvironment() -> Config {
        let port = Int(ProcessInfo.processInfo.environment["NOTIO_PORT"] ?? "") ?? 8080
        let version = ProcessInfo.processInfo.environment["NOTIO_VERSION"] ?? "dev"
        let webhookPath = ProcessInfo.processInfo.environment["NOTIO_WEBHOOK_PATH"] ?? "webhook"
        let diagnosticMode = DiagnosticMode(
            rawValue: ProcessInfo.processInfo.environment["NOTIO_DIAGNOSTIC_MODE"] ?? ""
        )
        return Config(port: port, version: version, webhookPath: webhookPath, diagnosticMode: diagnosticMode)
    }
}

public enum DiagnosticMode: Equatable, Sendable {
    case ack

    public init?(rawValue: String) {
        switch rawValue {
        case "ack": self = .ack
        default: return nil
        }
    }
}
