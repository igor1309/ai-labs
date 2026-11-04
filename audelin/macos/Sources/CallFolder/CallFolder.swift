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
    private let names: @Sendable (URL) throws -> [String]

    public init(callsURL: URL, now: @escaping @Sendable () -> Date, timeZone: TimeZone) {

        self.init(callsURL: callsURL, now: now, timeZone: timeZone, createDirectory: { url in
            guard mkdir(url.path, 0o700) == 0 else {
                throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
            }
        }, names: { url in
            guard let directory = opendir(url.path) else {
                throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
            }
            defer { closedir(directory) }
            var names: [String] = []
            while let entry = readdir(directory) {
                names.append(withUnsafeBytes(of: entry.pointee.d_name) { String(decoding: $0.prefix(Int(entry.pointee.d_namlen)), as: UTF8.self) })
            }
            return names
        })
    }

    init(
        callsURL: URL,
        now: @escaping @Sendable () -> Date,
        timeZone: TimeZone,
        createDirectory: @escaping @Sendable (URL) throws -> Void,
        names: @escaping @Sendable (URL) throws -> [String]
    ) {

        self.callsURL = callsURL
        self.now = now
        self.timeZone = timeZone
        self.createDirectory = createDirectory
        self.names = names
    }

    /// Names the folder `<id> <title>`, or the bare id without a title, with an id no entry there has.
    public func make(title: String? = nil) throws -> Made {

        guard callsURL.isFileURL else { throw POSIXError(.EINVAL) }
        let date = now()
        // An id is taken by any entry named by it, whatever its title, so no two calls share one.
        let taken = try names(callsURL)
        var number = 1
        while true {
            // The number goes before the title so folders sort by time.
            let id = CallFolderName.id(at: date, number: number, timeZone: timeZone)
            if taken.contains(where: { $0 == id || $0.hasPrefix(id + " ") }) {
                number += 1
                continue
            }
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
