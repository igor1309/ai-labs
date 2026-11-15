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

extension Driver {
    func absent(_ identifier: String) throws {
        _ = try wait("\(identifier) gone") {
            descendants(root).contains { string($0, kAXIdentifierAttribute) == identifier } ? nil : true
        }
    }

    /// Focuses the detail's tags field and types a tag and Return into the app as key events.
    func enterTag(_ tag: String) throws {
        let entry = try element("preview.tagEntry")
        let error = AXUIElementSetAttributeValue(entry, kAXFocusedAttribute as CFString, kCFBooleanTrue)
        guard error == .success else { throw LiveFailure("Focus preview.tagEntry: \(error.rawValue)") }
        _ = try wait("preview.tagEntry focused") {
            (attribute(entry, kAXFocusedAttribute) as? Bool) == true ? true : nil
        }
        for character in tag.utf16 { key(0, unicode: [character]) }
        _ = try element("preview.tagEntry", value: { $0 == tag })
        key(36)
    }

    private func key(_ code: CGKeyCode, unicode: [UniChar] = []) {
        for down in [true, false] {
            guard let event = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: down) else { continue }
            if !unicode.isEmpty { event.keyboardSetUnicodeString(stringLength: unicode.count, unicodeString: unicode) }
            event.postToPid(process.processIdentifier)
        }
    }

    /// The toolbar's merge control, found anywhere in the app: the toolbar is not inside the content view.
    func pressMergeControl() throws {
        let control = try wait("calls.merge") {
            descendants(root).first {
                string($0, kAXIdentifierAttribute) == "calls.merge" && (attribute($0, kAXEnabledAttribute) as? Bool) == true
            }
        }
        // The toolbar's control can report a failure for a press it acted on; merge mode opening is the check.
        _ = AXUIElementPerformAction(control, kAXPressAction as CFString)
        _ = try element("calls.merge.confirm")
    }
}

extension Driver {
    /// Posts a key press to the app; Return 36, Escape 53, Up 126.
    func type(_ code: CGKeyCode, text: String = "") {
        for down in [true, false] {
            guard let event = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: down) else { continue }
            let units = Array(text.utf16)
            if !units.isEmpty { event.keyboardSetUnicodeString(stringLength: units.count, unicodeString: units) }
            event.postToPid(process.processIdentifier)
        }
    }

    /// Opens the rename field on a row with ⌘R, waits for it focused, types the title.
    func beginRename(_ id: String, title: String) throws {
        try press("calls.select.\(id)")
        _ = try wait("\(id) selected") { selected(id) ? true : nil }
        // Keys go to the key window: the app is brought forward first.
        NSRunningApplication(processIdentifier: process.processIdentifier)?.activate()
        _ = try wait("the app frontmost") {
            NSWorkspace.shared.frontmostApplication?.processIdentifier == process.processIdentifier ? true : nil
        }
        let row = try element("calls.select.\(id)")
        _ = AXUIElementSetAttributeValue(row, kAXFocusedAttribute as CFString, kCFBooleanTrue)
        guard let down = CGEvent(keyboardEventSource: nil, virtualKey: 15, keyDown: true),
              let up = CGEvent(keyboardEventSource: nil, virtualKey: 15, keyDown: false) else { throw LiveFailure("⌘R event") }
        down.flags = .maskCommand; up.flags = .maskCommand
        down.postToPid(process.processIdentifier); up.postToPid(process.processIdentifier)
        let field = try wait("calls.rename") { focusedField() }
        _ = try wait("calls.rename focused") { (attribute(field, kAXFocusedAttribute) as? Bool) == true ? true : nil }
        let error = AXUIElementSetAttributeValue(field, kAXValueAttribute as CFString, "" as CFString)
        guard error == .success else { throw LiveFailure("Clear calls.rename: \(error.rawValue)") }
        for character in title { type(0, text: String(character)) }
        _ = try wait("calls.rename = \(title)") { string(field, kAXValueAttribute) == title ? true : nil }
    }

    /// The rename field, read as the app's focused element: it sits inside the row's button.
    func focusedField() -> AXUIElement? {
        guard let focused = attribute(root, kAXFocusedUIElementAttribute) else { return nil }
        let element = focused as! AXUIElement
        let id = string(element, kAXIdentifierAttribute)
        if string(element, kAXRoleAttribute) == kAXTextFieldRole, id != "calls.search" {
            return id == "calls.rename" ? element : nil
        }
        return nil
    }

    /// A right-click at the middle of the element's accessibility frame: the row's menu is
    /// AppKit's, opened by a real right mouse event. The point comes from accessibility, not a fixed spot.
    func rightClick(_ identifier: String) throws {
        let target = try element(identifier)
        var origin = CGPoint.zero, size = CGSize.zero
        guard let position = attribute(target, kAXPositionAttribute), let extent = attribute(target, kAXSizeAttribute),
              AXValueGetValue(position as! AXValue, .cgPoint, &origin), AXValueGetValue(extent as! AXValue, .cgSize, &size)
        else { throw LiveFailure("No frame for \(identifier)") }
        let point = CGPoint(x: origin.x + size.width / 2, y: origin.y + size.height / 2)
        for type in [CGEventType.rightMouseDown, .rightMouseUp] {
            CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: .right)?.post(tap: .cghidEventTap)
        }
    }

    func selected(_ id: String) -> Bool {
        guard let row = descendants(root).first(where: { string($0, kAXIdentifierAttribute) == "calls.select.\(id)" }) else { return false }
        return (attribute(row, kAXSelectedAttribute) as? Bool) == true
    }
}

private let a = "2024.01.01-1000", b = "2024.01.01-1006", d = "2024.01.01-1030"

private struct Fixture {
    let calls: URL, control: URL, output: URL
    func folder(_ name: String) -> Bool { FileManager.default.fileExists(atPath: calls.appendingPathComponent(name).path) }
    var opened: [String] {
        ((try? FileManager.default.contentsOfDirectory(atPath: control.path)) ?? []).filter { $0.hasPrefix("opened-") }
    }
}

@main private enum CallsRenameLive {
    @MainActor static func main() async {
        var output: URL?
        do {
            guard CommandLine.arguments.count == 2 else { throw LiveFailure("Usage: calls-rename <CallsRehearsal executable>") }
            guard AXIsProcessTrusted() else { throw LiveFailure("The live driver needs Accessibility access in this logged-in session.") }
            let app = URL(fileURLWithPath: CommandLine.arguments[1]).standardizedFileURL
            let root = FileManager.default.temporaryDirectory.appendingPathComponent("audelin-rename-live-\(UUID())")
            output = root
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
            print("Artifacts: \(root.path)")
            let scenarios: [(String, (Driver, Fixture) throws -> Void)] = [
                ("return", returnSaves), ("click", clickSaves), ("right-click", rightClickSaves),
                ("arrow", arrowSaves), ("escape", escapeCancels),
            ]
            for (name, run) in scenarios {
                try launch(app: app, root: root, name: name, run: run)
                print("Scenario passed: \(name)")
            }
            removeFixtures(root)
            print("PASS: renaming a call in the calls list saves on Return, click, right-click and arrow, and Escape cancels")
        } catch {
            fputs("FAIL: \(error)\n", stderr)
            if let output { removeFixtures(output) }
            exit(1)
        }
    }

    private static func removeFixtures(_ root: URL) {
        for name in (try? FileManager.default.contentsOfDirectory(atPath: root.path)) ?? [] {
            let url = root.appendingPathComponent(name)
            guard (try? url.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory == true else { continue }
            try? FileManager.default.removeItem(at: url)
        }
    }

    @MainActor private static func launch(app: URL, root: URL, name: String, run: (Driver, Fixture) throws -> Void) throws {
        let folder = root.appendingPathComponent(name)
        let calls = folder.appendingPathComponent("calls"), state = folder.appendingPathComponent("state")
        let fixture = Fixture(calls: calls, control: state.appendingPathComponent("control"), output: root)
        for made in [calls, fixture.control] { try FileManager.default.createDirectory(at: made, withIntermediateDirectories: true) }
        let application = Process()
        application.executableURL = app
        application.arguments = ["--calls", calls.path, "--state", state.path, "--trash", folder.appendingPathComponent("trash").path, "--seed", "merge"]
        defer { if application.isRunning { application.terminate() } }
        try application.run()
        let driver = try Driver(process: application, folders: [calls, fixture.control])
        defer { driver.stop() }
        do {
            _ = try driver.element("calls.select.\(d)")
            try run(driver, fixture)
        } catch {
            try? driver.screenshot("\(name)-failure", into: root)
            throw error
        }
        application.terminate()
        _ = try driver.wait("app termination") { application.isRunning ? nil : true }
        guard !FileManager.default.fileExists(atPath: calls.appendingPathComponent("AGENTS.md").path) else { throw LiveFailure("AGENTS.md appeared in the calls folder; only the Settings button may write it") }
    }

    /// The renamed folder is on disk, the old one gone, the row shows the title and no field is open.
    @MainActor private static func saved(_ driver: Driver, _ fixture: Fixture, _ id: String, _ title: String) throws {
        _ = try driver.wait("folder «\(id) \(title)»") { fixture.folder("\(id) \(title)") && !fixture.folder(id) ? true : nil }
        _ = try driver.wait("rename closed") { driver.focusedField() == nil ? true : nil }
        _ = try driver.wait("row titled \(title)") {
            descendants(driver.root).contains {
                string($0, kAXIdentifierAttribute) == "calls.select.\(id)" && string($0, kAXDescriptionAttribute).contains(title)
                    || string($0, kAXIdentifierAttribute) == "calls.select.\(id)" && string($0, kAXTitleAttribute).contains(title)
            } ? true : nil
        }
    }

    @MainActor private static func returnSaves(_ driver: Driver, _ fixture: Fixture) throws {
        try driver.beginRename(a, title: "Клиент")
        try driver.screenshot("return-editing", into: fixture.output)
        driver.type(36)
        try saved(driver, fixture, a, "Клиент")
        guard driver.selected(a) else { throw LiveFailure("A is not selected after Return") }
        guard fixture.opened.isEmpty else { throw LiveFailure("Return opened the folder: \(fixture.opened)") }
        try driver.screenshot("return-saved", into: fixture.output)
    }

    @MainActor private static func clickSaves(_ driver: Driver, _ fixture: Fixture) throws {
        try driver.beginRename(a, title: "Клик")
        try driver.press("calls.select.\(b)")
        try saved(driver, fixture, a, "Клик")
        _ = try driver.wait("B selected") { driver.selected(b) ? true : nil }
        guard fixture.opened.isEmpty else { throw LiveFailure("A click opened a folder") }
    }

    @MainActor private static func rightClickSaves(_ driver: Driver, _ fixture: Fixture) throws {
        try driver.beginRename(a, title: "Меню")
        try driver.rightClick("calls.select.\(b)")
        try saved(driver, fixture, a, "Меню")
        _ = try driver.wait("B selected") { driver.selected(b) ? true : nil }
        driver.type(53)
    }

    @MainActor private static func arrowSaves(_ driver: Driver, _ fixture: Fixture) throws {
        try driver.beginRename(a, title: "Стрелка")
        driver.type(126) // Up: the list is newest first, so B is above A.
        try saved(driver, fixture, a, "Стрелка")
        _ = try driver.wait("B selected") { driver.selected(b) ? true : nil }
    }

    @MainActor private static func escapeCancels(_ driver: Driver, _ fixture: Fixture) throws {
        try driver.beginRename(a, title: "Отмена")
        driver.type(53)
        _ = try driver.wait("rename closed") { driver.focusedField() == nil ? true : nil }
        guard fixture.folder(a), !fixture.folder("\(a) Отмена") else { throw LiveFailure("Escape renamed the folder") }
        guard fixture.opened.isEmpty else { throw LiveFailure("Escape opened a folder") }
        try driver.screenshot("escape-cancelled", into: fixture.output)
    }
}
