import Composer
import os

struct SystemLogSink: LogSink {

    private let loggers = Dictionary(uniqueKeysWithValues: LogEntry.Category.allCases.map {
        ($0, Logger(subsystem: "dev.igor1309.audelin", category: $0.rawValue))
    })

    func write(_ entry: LogEntry) {

        let logger = loggers[entry.category]!
        if let error = entry.error {
            logger.error("\(entry.message, privacy: .public) error=\(error, privacy: .public) path=\(entry.path ?? "", privacy: .private)")
        } else {
            logger.notice("\(entry.message, privacy: .public) path=\(entry.path ?? "", privacy: .private)")
        }
    }
}

