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

/// A value as text; a switch reports a number.
private func axValue(_ element: AXUIElement) -> String {
    let raw = attribute(element, kAXValueAttribute)
    if let number = raw as? NSNumber { return number.stringValue }
    return raw as? String ?? ""
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

/// Both accessibility and directory events wake the same run loop; no periodic timer drives assertions.
@MainActor private final class Driver {
    let process: Process
    let root: AXUIElement
    private let observer: AXObserver
    private let files: [DispatchSourceFileSystemObject]
    private var registered = Set<String>()
    private var expired = false

    init(process: Process, folders: [URL]) throws {
        self.process = process
        root = AXUIElementCreateApplication(process.processIdentifier)
        var observer: AXObserver?
        let error = AXObserverCreate(process.processIdentifier, { _, _, _, _ in
            CFRunLoopStop(CFRunLoopGetMain())
        }, &observer)
        guard error == .success, let observer else { throw LiveFailure("AXObserverCreate: \(error.rawValue)") }
        self.observer = observer
        var watches: [DispatchSourceFileSystemObject] = []
        for folder in folders {
            let fd = open(folder.path, O_EVTONLY)
            guard fd >= 0 else {
                watches.forEach { $0.cancel() }
                throw LiveFailure("Cannot watch \(folder.path)")
            }
            let source = DispatchSource.makeFileSystemObjectSource(fileDescriptor: fd, eventMask: .write, queue: .main)
            source.setEventHandler { CFRunLoopStop(CFRunLoopGetMain()) }
            source.setCancelHandler { close(fd) }
            source.resume()
            watches.append(source)
        }
        files = watches
        process.terminationHandler = { _ in DispatchQueue.main.async { CFRunLoopStop(CFRunLoopGetMain()) } }
        CFRunLoopAddSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(observer), .defaultMode)
    }

    func stop() {
        files.forEach { $0.cancel() }
        CFRunLoopRemoveSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(observer), .defaultMode)
    }

    private func observe() {
        let notifications = [kAXWindowCreatedNotification, kAXLayoutChangedNotification,
                             kAXValueChangedNotification, kAXUIElementDestroyedNotification,
                             kAXSelectedChildrenChangedNotification, kAXFocusedUIElementChangedNotification,
                             kAXTitleChangedNotification, kAXCreatedNotification]
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

    func wait<T>(_ description: String, _ read: () throws -> T?) throws -> T {
        expired = false
        let guardTimer = Timer(timeInterval: 45, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated { self?.expired = true }
            CFRunLoopStop(CFRunLoopGetMain())
        }
        RunLoop.main.add(guardTimer, forMode: .default)
        defer { guardTimer.invalidate() }
        while true {
            observe()
            if let result = try read() { return result }
            if expired || !process.isRunning {
                let tree = descendants(root).map {
                    "\(string($0, kAXRoleAttribute)) \(string($0, kAXIdentifierAttribute)) label=\(string($0, kAXTitleAttribute)) value=\(axValue($0))"
                }.joined(separator: "\n")
                throw LiveFailure("Waiting for \(description) failed\n\(tree)")
            }
            CFRunLoopRun()
        }
    }

    func element(_ identifier: String, value: ((String) -> Bool)? = nil) throws -> AXUIElement {
        try wait(identifier) {
            guard let window = settingsWindow() else { return nil }
            return descendants(window).first {
                string($0, kAXIdentifierAttribute) == identifier && (value?(axValue($0)) ?? true)
            }
        }
    }

    func settingsWindow() -> AXUIElement? {
        descendants(root).first { string($0, kAXIdentifierAttribute) == "settings.window" }
    }

    func press(_ identifier: String) throws {
        let target = try element(identifier)
        let error = AXUIElementPerformAction(target, kAXPressAction as CFString)
        guard error == .success else { throw LiveFailure("Press \(identifier): \(error.rawValue)") }
    }

    /// The settings window's width in points, read from accessibility.
    func windowWidth() throws -> CGFloat {
        let window = try wait("settings.window") { settingsWindow() }
        guard let value = attribute(window, kAXSizeAttribute) else { throw LiveFailure("settings.window has no size") }
        var size = CGSize.zero
        AXValueGetValue(value as! AXValue, .cgSize, &size)
        return size.width
    }

    func screenshot(_ name: String, into folder: URL) throws {
        let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
        guard let window = windows.first(where: {
            ($0[kCGWindowOwnerPID as String] as? Int32) == process.processIdentifier && ($0[kCGWindowLayer as String] as? Int) == 0
        }), let number = window[kCGWindowNumber as String] as? Int else { throw LiveFailure("No visible settings window") }
        let path = folder.appendingPathComponent(name + ".png")
        let capture = Process()
        capture.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        capture.arguments = ["-x", "-o", "-l", String(number), path.path]
        try capture.run()
        capture.waitUntilExit()
        guard capture.terminationStatus == 0, FileManager.default.fileExists(atPath: path.path) else {
            throw LiveFailure("Screenshot failed: \(path.path)")
        }
        print("Screenshot: \(path.path)")
    }
}

/// The settings window's whole width: 460 pt of content padded 24 pt on each side.
private let settingsWidth: CGFloat = 508

@main private enum SettingsLive {
    @MainActor static func main() async {
        var output: URL?
        do {
            guard CommandLine.arguments.count == 2 else { throw LiveFailure("Usage: settings <CallsRehearsal executable>") }
            guard AXIsProcessTrusted() else { throw LiveFailure("The live driver needs Accessibility access in this logged-in session.") }
            let app = URL(fileURLWithPath: CommandLine.arguments[1]).standardizedFileURL
            let root = FileManager.default.temporaryDirectory.appendingPathComponent("audelin-settings-live-\(UUID())")
            output = root
            let calls = root.appendingPathComponent("fixture/calls"), state = root.appendingPathComponent("fixture/state")
            let trash = root.appendingPathComponent("fixture/trash")
            for made in [calls, state] { try FileManager.default.createDirectory(at: made, withIntermediateDirectories: true) }
            print("Artifacts: \(root.path)")
            let application = Process()
            application.executableURL = app
            application.arguments = ["--calls", calls.path, "--state", state.path, "--trash", trash.path, "--show-settings"]
            defer { if application.isRunning { application.terminate() } }
            try application.run()
            let driver = try Driver(process: application, folders: [state])
            defer { driver.stop() }
            do {
                try run(driver, state: state, output: root)
            } catch {
                try? driver.screenshot("settings-failure", into: root)
                throw error
            }
            application.terminate()
            _ = try driver.wait("app termination") { application.isRunning ? nil : true }
            try? FileManager.default.removeItem(at: root.appendingPathComponent("fixture"))
            print("PASS: the settings window keeps its width on every tab and a switch saves its preference")
        } catch {
            fputs("FAIL: \(error)\n", stderr)
            if let output { try? FileManager.default.removeItem(at: output.appendingPathComponent("fixture")) }
            exit(1)
        }
    }

    /// Each tab shows at the window's fixed width; turning on automatic recording
    /// switches it on and writes the preference.
    @MainActor private static func run(_ driver: Driver, state: URL, output: URL) throws {
        for tab in ["general", "recording", "callNotes"] {
            try driver.press("tab-\(tab)")
            _ = try driver.wait("\(tab) at \(settingsWidth) pt") { try driver.windowWidth() == settingsWidth ? true : nil }
            try driver.screenshot("settings-\(tab)", into: output)
        }
        try driver.press("tab-recording")
        _ = try driver.element("records-calls", value: { $0 == "0" })
        try driver.press("records-calls")
        _ = try driver.element("records-calls", value: { $0 == "1" })
        _ = try driver.wait("automaticRecording saved") {
            let text = try? String(contentsOf: state.appendingPathComponent("preferences.json"), encoding: .utf8)
            return text?.contains("\"automaticRecording\":true") == true ? true : nil
        }
        try driver.screenshot("settings-recording-on", into: output)
    }
}
