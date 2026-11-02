import Composer
import os

/// The rehearsal emits the same intervals as the executable so the profiling tools can group its work.
public func rehearsalIntervals() -> ProfileIntervals {
    let log = OSLog(subsystem: "dev.igor1309.audelin", category: .pointsOfInterest)
    return ProfileIntervals { name in
        let id = OSSignpostID(log: log)
        os_signpost(.begin, log: log, name: name, signpostID: id)
        return { os_signpost(.end, log: log, name: name, signpostID: id) }
    }
}

struct RehearsalLog: LogSink {
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
