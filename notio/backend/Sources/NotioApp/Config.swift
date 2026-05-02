import Foundation

public struct Config: Sendable {
    public let port: Int
    public let version: String
    public let webhookPath: String
    public let diagnosticMode: DiagnosticMode?
    public let supabaseURL: String?
    public let supabaseKey: String?
    public let telegramBotToken: String?

    public init(
        port: Int = 8080,
        version: String = "dev",
        webhookPath: String,
        diagnosticMode: DiagnosticMode? = nil,
        supabaseURL: String? = nil,
        supabaseKey: String? = nil,
        telegramBotToken: String? = nil
    ) {
        self.port = port
        self.version = version
        self.webhookPath = webhookPath
        self.diagnosticMode = diagnosticMode
        self.supabaseURL = supabaseURL
        self.supabaseKey = supabaseKey
        self.telegramBotToken = telegramBotToken
    }

    public enum ConfigError: Error, Equatable {
        case missingWebhookPath
        case missingBotToken
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
        var diagnosticMode = DiagnosticMode(rawValue: env["NOTIO_DIAGNOSTIC_MODE"] ?? "")
        if case .delay = diagnosticMode, let ms = Int(env["NOTIO_DIAGNOSTIC_DELAY_MS"] ?? "") {
            diagnosticMode = .delay(milliseconds: ms)
        }
        if case .fail = diagnosticMode, let status = Int(env["NOTIO_DIAGNOSTIC_FAIL_STATUS"] ?? "") {
            diagnosticMode = .fail(status: status)
        }
        let supabaseURL = env["NOTIO_SUPABASE_URL"]
        let supabaseKey = env["NOTIO_SUPABASE_KEY"]
        let telegramBotToken = env["NOTIO_TELEGRAM_BOT_TOKEN"]?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if diagnosticMode == nil && (telegramBotToken ?? "").isEmpty {
            throw ConfigError.missingBotToken
        }
        return Config(
            port: port,
            version: version,
            webhookPath: webhookPath,
            diagnosticMode: diagnosticMode,
            supabaseURL: supabaseURL,
            supabaseKey: supabaseKey,
            telegramBotToken: telegramBotToken
        )
    }
}

public enum DiagnosticMode: Equatable, Sendable {
    case ack
    case inspect
    case delay(milliseconds: Int)
    case fail(status: Int)

    public init?(rawValue: String) {
        switch rawValue {
        case "ack": self = .ack
        case "inspect": self = .inspect
        case "delay": self = .delay(milliseconds: 5000)
        case "fail": self = .fail(status: 500)
        default: return nil
        }
    }
}
