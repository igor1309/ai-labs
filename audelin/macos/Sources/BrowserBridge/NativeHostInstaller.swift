import Foundation

/// Registers Audelin's native-messaging host with each Chromium browser the
/// owner has, by writing the host manifest into the browser's
/// `NativeMessagingHosts` folder. The browser starts the host only for the
/// extension the manifest allows. Run at every launch: it repairs a missing
/// or stale manifest of ours, leaves a file it does not own alone, and
/// rewrites nothing that is already right.
public struct NativeHostInstaller: Sendable {
    public static let hostName = "app.audelin.call_companion"
    public static let extensionID = "boljabpcnipijdcdjjnmnpbfbdjjodkf"
    static let description = "Audelin call companion"
    /// The helper's file name in the app's `Contents/MacOS`.
    public static let helperName = "audelin-browser-host"

    public enum Browser: String, CaseIterable, Sendable {
        case chrome, yandex

        /// The browser's profile root under the home folder.
        var supportFolder: String {
            switch self {
            case .chrome: "Library/Application Support/Google/Chrome"
            case .yandex: "Library/Application Support/Yandex/YandexBrowser"
            }
        }
    }

    public enum Outcome: Equatable, Sendable {
        case written, unchanged
        /// The browser is not installed for this user.
        case browserAbsent
        /// A file of that name that Audelin did not write; left as it is.
        case foreignFile
    }

    private let home: URL
    private let hostExecutable: URL

    /// `home` is the owner's home folder; `appBundle` the running
    /// `Audelin.app`, whose bundled helper the browsers start.
    public init(home: URL, appBundle: URL) {
        self.home = home
        hostExecutable = appBundle.appending(path: "Contents/MacOS").appending(path: Self.helperName)
    }

    public func install() throws -> [Browser: Outcome] {
        var outcomes: [Browser: Outcome] = [:]
        for browser in Browser.allCases { outcomes[browser] = try install(for: browser) }
        return outcomes
    }

    /// Where the manifest goes for one browser.
    public func manifestURL(for browser: Browser) -> URL {
        home.appending(path: browser.supportFolder).appending(path: "NativeMessagingHosts").appending(path: "\(Self.hostName).json")
    }

    private func install(for browser: Browser) throws -> Outcome {
        let files = FileManager.default
        var isFolder: ObjCBool = false
        guard files.fileExists(atPath: home.appending(path: browser.supportFolder).path, isDirectory: &isFolder), isFolder.boolValue else {
            return .browserAbsent
        }
        let url = manifestURL(for: browser)
        let wanted = manifest()
        if let existing = try? Data(contentsOf: url) {
            if existing == wanted { return .unchanged }
            guard Self.isOurs(existing) else { return .foreignFile }
        }
        try files.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try wanted.write(to: url, options: .atomic)
        return .written
    }

    private func manifest() -> Data {
        let object: [String: Any] = [
            "name": Self.hostName,
            "description": Self.description,
            "path": hostExecutable.path,
            "type": "stdio",
            "allowed_origins": ["chrome-extension://\(Self.extensionID)/"],
        ]
        // Sorted keys keep the bytes the same from run to run.
        return try! JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
    }

    private static func isOurs(_ data: Data) -> Bool {
        guard let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return false }
        return object["name"] as? String == hostName && object["description"] as? String == description
    }
}
