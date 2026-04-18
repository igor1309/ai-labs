import Foundation

struct Config {
    let port: Int
    let version: String
    let webhookPath: String
    let diagnosticMode: DiagnosticMode?

    init(
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

    static func fromEnvironment() -> Config {
        let port = Int(ProcessInfo.processInfo.environment["NOTIO_PORT"] ?? "") ?? 8080
        let version = ProcessInfo.processInfo.environment["NOTIO_VERSION"] ?? "dev"
        let webhookPath = ProcessInfo.processInfo.environment["NOTIO_WEBHOOK_PATH"] ?? "webhook"
        let diagnosticMode = DiagnosticMode(
            rawValue: ProcessInfo.processInfo.environment["NOTIO_DIAGNOSTIC_MODE"] ?? ""
        )
        return Config(port: port, version: version, webhookPath: webhookPath, diagnosticMode: diagnosticMode)
    }
}

enum DiagnosticMode: Equatable {
    case ack

    init?(rawValue: String) {
        switch rawValue {
        case "ack": self = .ack
        default: return nil
        }
    }
}
