import Darwin
import Foundation

/// Makes a new call's folder without changing any name already taken.
public struct CallFolder: Sendable {

    public struct Made: Equatable, Sendable {

        public let url: URL
        public let microphoneURL: URL
        public let callURL: URL
        public let transcriptURL: URL

        init(url: URL) {

            self.url = url
            microphoneURL = url.appendingPathComponent("microphone.caf")
            callURL = url.appendingPathComponent("call.caf")
            transcriptURL = url.appendingPathComponent("transcript.md")
        }
    }

    private let callsURL: URL
    private let now: @Sendable () -> Date
    private let timeZone: TimeZone
    private let createDirectory: @Sendable (URL) throws -> Void

    public init(callsURL: URL, now: @escaping @Sendable () -> Date, timeZone: TimeZone) {

        self.init(callsURL: callsURL, now: now, timeZone: timeZone, createDirectory: { url in
            guard mkdir(url.path, 0o700) == 0 else {
                throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
            }
        })
    }

    init(
        callsURL: URL,
        now: @escaping @Sendable () -> Date,
        timeZone: TimeZone,
        createDirectory: @escaping @Sendable (URL) throws -> Void
    ) {

        self.callsURL = callsURL
        self.now = now
        self.timeZone = timeZone
        self.createDirectory = createDirectory
    }

    /// Names the folder `<timestamp> <title>`, or the bare timestamp without a title.
    public func make(title: String? = nil) throws -> Made {

        guard callsURL.isFileURL else { throw POSIXError(.EINVAL) }
        // Digits from a fixed calendar, so the user's locale and calendar never reach the name.
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let parts = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: now())
        let base = String(format: "%04d.%02d.%02d-%02d%02d",
                          parts.year ?? 0, parts.month ?? 0, parts.day ?? 0, parts.hour ?? 0, parts.minute ?? 0)
        // Neither can be in a folder name; the number goes before the title so folders sort by time.
        let suffix = title.map { " " + $0.replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: ":", with: "-") } ?? ""
        var number = 1
        while true {
            let name = (number == 1 ? base : "\(base)-\(number)") + suffix
            let url = callsURL.appendingPathComponent(name, isDirectory: true)
            do {
                try createDirectory(url)
                return Made(url: url)
            } catch let error as POSIXError where error.code == .EEXIST {
                number += 1
            }
        }
    }
}
