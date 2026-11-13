import AppKit
import ApplicationServices
import CoreGraphics

private struct LiveFailure: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

private func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var result: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &result) == .success else { return nil }
    return result
}

private func string(_ element: AXUIElement, _ name: String) -> String {
    attribute(element, name) as? String ?? ""
}

private func descendants(_ root: AXUIElement) -> [AXUIElement] {
    var result: [AXUIElement] = [], pending = [root]
    var seen = Set<CFHashCode>()
    while let element = pending.popLast() {
        guard seen.insert(CFHash(element)).inserted else { continue }
        result.append(element)
        pending += attribute(element, kAXChildrenAttribute) as? [AXUIElement] ?? []
    }
    return result
}

/// One panel row as accessibility shows it: its text and its speaker's name.
private struct Row: CustomStringConvertible {
    let id: String
    let text: String
    let speaker: String
    var description: String { "\(id) speaker=\(speaker) text=\(text.prefix(40))" }
}

/// Accessibility events and the app's exit wake the run loop; no periodic timer drives assertions.
@MainActor private final class Driver {
    let process: Process
    let root: AXUIElement
    private let observer: AXObserver
    private var registered = Set<String>()
    private var expired = false

    init(process: Process) throws {
        self.process = process
        root = AXUIElementCreateApplication(process.processIdentifier)
        var observer: AXObserver?
        let error = AXObserverCreate(process.processIdentifier, { _, _, _, _ in
            CFRunLoopStop(CFRunLoopGetMain())
        }, &observer)
        guard error == .success, let observer else { throw LiveFailure("AXObserverCreate: \(error.rawValue)") }
        self.observer = observer
        process.terminationHandler = { _ in DispatchQueue.main.async { CFRunLoopStop(CFRunLoopGetMain()) } }
        CFRunLoopAddSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(observer), .defaultMode)
    }

    func stop() {
        CFRunLoopRemoveSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(observer), .defaultMode)
    }

    private func observe() {
        let notifications = [kAXWindowCreatedNotification, kAXLayoutChangedNotification,
                             kAXValueChangedNotification, kAXUIElementDestroyedNotification, kAXCreatedNotification]
        for element in descendants(root) {
            for notification in notifications {
                let key = "\(CFHash(element))-\(notification)"
                guard !registered.contains(key) else { continue }
                if AXObserverAddNotification(observer, element, notification as CFString, nil) == .success {
                    registered.insert(key)
                }
            }
        }
    }

    /// The panel's rows, in the order they are drawn.
    func rows() -> [Row] {
        descendants(root).compactMap { element in
            let id = string(element, kAXIdentifierAttribute)
            guard id.hasPrefix("panel.row.") else { return nil }
            return Row(id: id, text: string(element, kAXDescriptionAttribute), speaker: string(element, kAXValueAttribute))
        }.sorted { Int($0.id.dropFirst("panel.row.".count)) ?? 0 < Int($1.id.dropFirst("panel.row.".count)) ?? 0 }
    }

    func wait<T>(_ description: String, seconds: Double = 45, _ read: () throws -> T?) throws -> T {
        expired = false
        let guardTimer = Timer(timeInterval: seconds, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated { self?.expired = true }
            CFRunLoopStop(CFRunLoopGetMain())
        }
        RunLoop.main.add(guardTimer, forMode: .default)
        defer { guardTimer.invalidate() }
        while true {
            if process.isRunning { observe() }
            if let result = try read() { return result }
            if expired || !process.isRunning {
                throw LiveFailure("Waiting for \(description) failed; rows:\n" + rows().map(\.description).joined(separator: "\n"))
            }
            CFRunLoopRun()
        }
    }

    func exit(seconds: Double) throws {
        expired = false
        let guardTimer = Timer(timeInterval: seconds, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated { self?.expired = true }
            CFRunLoopStop(CFRunLoopGetMain())
        }
        RunLoop.main.add(guardTimer, forMode: .default)
        defer { guardTimer.invalidate() }
        while process.isRunning {
            if expired { throw LiveFailure("The rehearsal did not end its call") }
            CFRunLoopRun()
        }
        guard process.terminationStatus == 0 else { throw LiveFailure("The rehearsal exited with \(process.terminationStatus)") }
    }

    func screenshot(_ name: String, into folder: URL) throws {
        let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
        guard let window = windows.first(where: { ($0[kCGWindowOwnerPID as String] as? Int32) == process.processIdentifier }),
              let number = window[kCGWindowNumber as String] as? Int else { throw LiveFailure("No visible panel") }
        let path = folder.appendingPathComponent(name + ".png")
        let capture = Process()
        capture.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        capture.arguments = ["-x", "-l", String(number), path.path]
        try capture.run()
        capture.waitUntilExit()
        guard capture.terminationStatus == 0, FileManager.default.fileExists(atPath: path.path) else {
            throw LiveFailure("Screenshot failed: \(path.path)")
        }
        print("Screenshot: \(path.path)")
    }
}

@main private enum BrowserNamesLive {
    @MainActor static func main() async {
        do {
            guard CommandLine.arguments.count == 3 else {
                throw LiveFailure("Usage: browser-names <AudelinRehearsal executable> <events fixture>")
            }
            guard AXIsProcessTrusted() else { throw LiveFailure("The live driver needs Accessibility access in this logged-in session.") }
            let app = URL(fileURLWithPath: CommandLine.arguments[1]).standardizedFileURL
            let events = URL(fileURLWithPath: CommandLine.arguments[2]).standardizedFileURL
            let output = FileManager.default.temporaryDirectory.appendingPathComponent("audelin-browser-names-live-\(UUID())")
            try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
            print("Artifacts: \(output.path)")
            try scenario(app: app, events: events, output: output)
            try scenario(app: app, events: nil, output: output)
            print("PASS: remote speakers named from browser events, and unnamed without them")
        } catch {
            fputs("FAIL: \(error)\n", stderr)
            exit(1)
        }
    }

    @MainActor private static func scenario(app: URL, events: URL?, output: URL) throws {
        let name = events == nil ? "without-events" : "with-events"
        let recordings = output.appendingPathComponent(name)
        try FileManager.default.createDirectory(at: recordings, withIntermediateDirectories: true)
        let application = Process()
        application.executableURL = app
        application.arguments = ["--minutes", "1.1", "--speed", "1", "--recordings-dir", recordings.path]
            + (events.map { ["--browser-events", $0.path] } ?? [])
        try application.run()
        defer { if application.isRunning { application.terminate() } }
        let driver = try Driver(process: application)
        defer { driver.stop() }
        do {
            if events != nil {
                // Анна speaks first and Борис second; each name lands on a row of their side.
                for speaker in ["Анна", "Борис"] {
                    _ = try driver.wait("a row spoken by \(speaker)") {
                        driver.rows().first { $0.speaker == speaker && $0.text.contains("theirs") }
                    }
                }
                if let mislabelled = driver.rows().first(where: { !$0.speaker.isEmpty && $0.text.contains("mine") }) {
                    throw LiveFailure("My row carries a remote name: \(mislabelled)")
                }
            } else {
                // By their third sentence (from 36 s), rows named live would have been named.
                _ = try driver.wait("their third sentence", seconds: 60) { driver.rows().first { $0.text.contains("theirs60") } }
                if let named = driver.rows().first(where: { !$0.speaker.isEmpty }) {
                    throw LiveFailure("A row is named without browser events: \(named)")
                }
            }
            try driver.screenshot(name, into: output)
            try driver.exit(seconds: 120)
        } catch {
            try? driver.screenshot("\(name)-failure", into: output)
            throw error
        }
        let folders = try FileManager.default.contentsOfDirectory(at: recordings, includingPropertiesForKeys: nil)
        guard let transcript = folders.lazy.map({ $0.appendingPathComponent("transcript.md") })
            .first(where: { FileManager.default.fileExists(atPath: $0.path) }) else { throw LiveFailure("No transcript in \(recordings.path)") }
        let text = try String(contentsOf: transcript, encoding: .utf8)
        for speaker in ["Анна", "Борис"] where text.contains(speaker) != (events != nil) {
            throw LiveFailure("transcript.md \(events == nil ? "names" : "lacks") \(speaker):\n\(text)")
        }
    }
}
