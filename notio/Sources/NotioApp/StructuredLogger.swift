import Foundation
import Logging

/// JSON log handler that emits one JSON object per line with required structured fields.
struct JSONLogHandler: LogHandler {
    let label: String
    var metadata: Logger.Metadata = [:]
    var logLevel: Logger.Level = .info

    subscript(metadataKey key: String) -> Logger.Metadata.Value? {
        get { metadata[key] }
        set { metadata[key] = newValue }
    }

    func log(
        level: Logger.Level,
        message: Logger.Message,
        metadata: Logger.Metadata?,
        source: String,
        file: String,
        function: String,
        line: UInt
    ) {
        var merged = self.metadata
        metadata?.forEach { merged[$0.key] = $0.value }

        var record: [String: Any] = [
            "timestamp": ISO8601DateFormatter().string(from: Date()),
            "level": level.rawValue,
            "message": message.description,
        ]
        merged.forEach { record[$0.key] = $0.value.description }

        guard let data = try? JSONSerialization.data(withJSONObject: record),
              let line = String(data: data, encoding: .utf8)
        else { return }
        print(line)
    }
}

func makeLogger(label: String) -> Logger {
    Logger(label: label) { label in JSONLogHandler(label: label) }
}
