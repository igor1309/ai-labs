import Foundation
import os

public protocol LogDescribable {
    var logDescription: String { get }
}

public struct LogEntry: Sendable, Equatable {
    public enum Category: String, Sendable {
        case mode, hostRadio, clientRadio, rehearsal
        case amountEntry, hostBroadcast, timeoutNotice, hostPayment, clientFind, clientConnect, clientReview, clientPayment
    }

    public let category: Category
    public let message: String
    public let error: String?

    init(category: Category, message: String, error: String? = nil) {
        self.category = category
        self.message = message
        self.error = error
    }

    /// A rehearsal line takes a literal only, so no runtime value reaches the log.
    public static func rehearsal(_ message: StaticString) -> LogEntry {
        LogEntry(category: .rehearsal, message: "\(message)")
    }
}

public protocol LogSink: Sendable {
    func write(_ entry: LogEntry)
}

public struct SystemLogSink: LogSink {
    public init() {}
    public func write(_ entry: LogEntry) {
        let logger = Logger(subsystem: "mizan-ble", category: entry.category.rawValue)
        // Entries are constructed only here in the root, from redacted case names, counts and whole dBm signal strength.
        if let error = entry.error {
            logger.error("phase=\(entry.message, privacy: .public) failure=\(error, privacy: .public)")
        } else {
            logger.notice("phase=\(entry.message, privacy: .public)")
        }
    }
}
