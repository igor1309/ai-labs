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
                    "\(string($0, kAXRoleAttribute)) \(string($0, kAXIdentifierAttribute)) label=\(string($0, kAXTitleAttribute)) value=\(string($0, kAXValueAttribute))"
                }.joined(separator: "\n")
                throw LiveFailure("Waiting for \(description) failed\n\(tree)")
            }
            CFRunLoopRun()
        }
    }

    func element(_ identifier: String, value: ((String) -> Bool)? = nil) throws -> AXUIElement {
        try wait(identifier) {
            guard let window = descendants(root).first(where: { string($0, kAXIdentifierAttribute) == "calls.window" }) else { return nil }
            return descendants(window).first {
                string($0, kAXIdentifierAttribute) == identifier && (value?(string($0, kAXValueAttribute)) ?? true)
            }
        }
    }

    func press(_ identifier: String) throws {
        let target = try element(identifier)
        let error = AXUIElementPerformAction(target, kAXPressAction as CFString)
        guard error == .success else { throw LiveFailure("Press \(identifier): \(error.rawValue)") }
    }

    func screenshot(_ name: String, into folder: URL) throws {
        let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
        guard let window = windows.first(where: {
            ($0[kCGWindowOwnerPID as String] as? Int32) == process.processIdentifier && ($0[kCGWindowLayer as String] as? Int) == 0
        }), let number = window[kCGWindowNumber as String] as? Int else { throw LiveFailure("No visible calls window") }
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

@main private enum CallsSummaryLive {
    @MainActor static func main() async {
        do {
            guard CommandLine.arguments.count == 2 else { throw LiveFailure("Usage: calls-summary <CallsRehearsal executable>") }
            guard AXIsProcessTrusted() else { throw LiveFailure("The live driver needs Accessibility access in this logged-in session.") }
            let app = URL(fileURLWithPath: CommandLine.arguments[1]).standardizedFileURL
            let output = FileManager.default.temporaryDirectory.appendingPathComponent("audelin-summary-live-\(UUID())")
            try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
            print("Artifacts: \(output.path)")
            for cancel in [false, true] { try await scenario(app: app, output: output, cancel: cancel) }
            print("PASS: summary completion and cancellation")
        } catch {
            fputs("FAIL: \(error)\n", stderr)
            exit(1)
        }
    }

    @MainActor private static func scenario(app: URL, output: URL, cancel: Bool) async throws {
        let fixture = output.appendingPathComponent(cancel ? "cancel" : "complete")
        let calls = fixture.appendingPathComponent("calls")
        let call = calls.appendingPathComponent("2024.01.01-1000")
        let state = fixture.appendingPathComponent("state")
        let control = state.appendingPathComponent("control")
        for folder in [call, control] { try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true) }
        try "# Transcript\n\n**Me** 00:00:03\n\nОбсудили выпуск Audelin.\n".write(to: call.appendingPathComponent("transcript.md"), atomically: true, encoding: .utf8)
        let application = Process()
        application.executableURL = app
        application.arguments = ["--calls", calls.path, "--state", state.path, "--trash", fixture.appendingPathComponent("trash").path]
        try application.run()
        defer { if application.isRunning { application.terminate() } }
        let driver = try Driver(process: application, folders: [control, call])
        defer { driver.stop() }
        do { try steps(driver: driver, application: application, output: output, control: control, call: call, cancel: cancel) }
        catch {
            try? driver.screenshot(cancel ? "cancel-failure" : "failure", into: output)
            throw error
        }
    }

    @MainActor private static func steps(driver: Driver, application: Process, output: URL,
                                         control: URL, call: URL, cancel: Bool) throws {
        try driver.press("calls.select.2024.01.01-1000")
        _ = try driver.element("preview.empty", value: { $0 == "Нет итогов" })
        try driver.press("preview.make")
        _ = try driver.element("preview.making", value: { $0 == "Делаю…" })
        _ = try driver.element("preview.cancel", value: { $0 == "Отменить" })
        _ = try driver.wait("fake request started") { FileManager.default.fileExists(atPath: control.appendingPathComponent("started-1").path) ? true : nil }
        try driver.screenshot(cancel ? "cancel-making" : "making", into: output)
        if cancel {
            try driver.press("preview.cancel")
            _ = try driver.element("preview.empty", value: { $0 == "Нет итогов" })
            _ = try driver.wait("cancelled request and removed files") {
                let cancelled = FileManager.default.fileExists(atPath: control.appendingPathComponent("cancelled-1").path)
                let remaining = try FileManager.default.contentsOfDirectory(atPath: call.path)
                return cancelled && !remaining.contains(".summary-job.json") && !remaining.contains("summary.md") ? true : nil
            }
            // A late completion for a cancelled attempt must not create notes.
            try Data().write(to: control.appendingPathComponent("finish-1"))
            try driver.screenshot("cancelled", into: output)
        } else {
            try Data().write(to: control.appendingPathComponent("finish-1"))
            _ = try driver.element("preview.notes", value: { $0.contains("Обсудили выпуск Audelin.") && $0.contains("Сделано ") })
            _ = try driver.element("preview.made", value: { $0.hasPrefix("Сделано ") && $0.count > "Сделано ".count })
            let notes = try String(contentsOf: call.appendingPathComponent("summary.md"), encoding: .utf8)
            guard notes.contains("## О чём встреча\n\nОбсудили выпуск Audelin.") else { throw LiveFailure("Wrong notes file") }
            try driver.screenshot("completed", into: output)
        }
        application.terminate()
        _ = try driver.wait("app termination") { application.isRunning ? nil : true }
        if cancel {
            for name in ["summary.md", ".summary-job.json"] where FileManager.default.fileExists(atPath: call.appendingPathComponent(name).path) {
                throw LiveFailure("Cancelled call retained \(name)")
            }
        }
    }
}
