import CallFolderName
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
        let date = now()
        var number = 1
        while true {
            // The number goes before the title so folders sort by time.
            let id = CallFolderName.id(at: date, number: number, timeZone: timeZone)
            let name = CallFolderName.name(id: id, title: title)
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
