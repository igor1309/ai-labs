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

    func log(event: LogEvent) {
        var merged = self.metadata
        event.metadata?.forEach { merged[$0.key] = $0.value }

        var record: [String: Any] = [
            "timestamp": Date().ISO8601Format(),
            "level": event.level.rawValue,
            "message": event.message.description,
        ]
        merged.forEach { record[$0.key] = $0.value.description }

        guard let data = try? JSONSerialization.data(withJSONObject: record),
              let output = String(data: data, encoding: .utf8)
        else { return }
        print(output)
    }
}

func makeLogger(label: String) -> Logger {
    Logger(label: label) { label in JSONLogHandler(label: label) }
}
