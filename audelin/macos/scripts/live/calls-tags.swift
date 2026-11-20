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
        try typeTag(tag)
        key(36)
    }

    /// Focuses the detail's tags field and types a tag into it without submitting.
    func typeTag(_ tag: String) throws {
        let entry = try element("preview.tagEntry")
        let error = AXUIElementSetAttributeValue(entry, kAXFocusedAttribute as CFString, kCFBooleanTrue)
        guard error == .success else { throw LiveFailure("Focus preview.tagEntry: \(error.rawValue)") }
        _ = try wait("preview.tagEntry focused") {
            (attribute(entry, kAXFocusedAttribute) as? Bool) == true ? true : nil
        }
        for character in tag.utf16 { key(0, unicode: [character]) }
        _ = try element("preview.tagEntry", value: { $0 == tag })
    }

    func pressEscape() { key(53) }

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

/// The calls `CallsRehearsal --seed merge` writes: A and B with transcripts, C and D.
private let a = "2024.01.01-1000", b = "2024.01.01-1006", d = "2024.01.01-1030"

private struct Fixture {
    let calls: URL, state: URL, control: URL, trash: URL, output: URL
    func tags(_ id: String) -> String? {
        try? String(contentsOf: calls.appendingPathComponent("\(id)/tags.txt"), encoding: .utf8)
    }
}

@main private enum CallsTagsLive {
    @MainActor static func main() async {
        var output: URL?
        do {
            guard CommandLine.arguments.count == 2 else { throw LiveFailure("Usage: calls-tags <CallsRehearsal executable>") }
            guard AXIsProcessTrusted() else { throw LiveFailure("The live driver needs Accessibility access in this logged-in session.") }
            let app = URL(fileURLWithPath: CommandLine.arguments[1]).standardizedFileURL
            let root = FileManager.default.temporaryDirectory.appendingPathComponent("audelin-tags-live-\(UUID())")
            output = root
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
            print("Artifacts: \(root.path)")
            try launch(app: app, root: root, name: "tags", run: tagging)
            removeFixtures(root)
            print("PASS: cancelling a tag edit with Esc, tagging calls from the detail, filtering by the strip and merging tagged calls")
        } catch {
            fputs("FAIL: \(error)\n", stderr)
            if let output { removeFixtures(output) }
            exit(1)
        }
    }

    /// Keeps the screenshots and removes the seeded folder.
    private static func removeFixtures(_ root: URL) {
        for name in (try? FileManager.default.contentsOfDirectory(atPath: root.path)) ?? [] {
            let url = root.appendingPathComponent(name)
            guard (try? url.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory == true else { continue }
            try? FileManager.default.removeItem(at: url)
        }
    }

    /// Launches the rehearsal on a fresh seeded folder, runs the scenario and quits it.
    @MainActor private static func launch(app: URL, root: URL, name: String, run: (Driver, Fixture) throws -> Void) throws {
        let folder = root.appendingPathComponent(name)
        let fixture = Fixture(calls: folder.appendingPathComponent("calls"), state: folder.appendingPathComponent("state"),
                              control: folder.appendingPathComponent("state/control"), trash: folder.appendingPathComponent("trash"),
                              output: root)
        for made in [fixture.calls, fixture.control] { try FileManager.default.createDirectory(at: made, withIntermediateDirectories: true) }
        let application = Process()
        application.executableURL = app
        application.arguments = ["--calls", fixture.calls.path, "--state", fixture.state.path, "--trash", fixture.trash.path, "--seed", "merge"]
        defer { if application.isRunning { application.terminate() } }
        try application.run()
        let driver = try Driver(process: application, folders: [fixture.calls])
        defer { driver.stop() }
        do { try run(driver, fixture) }
        catch {
            try? driver.screenshot("\(name)-failure", into: root)
            throw error
        }
        application.terminate()
        _ = try driver.wait("app termination") { application.isRunning ? nil : true }
        guard !FileManager.default.fileExists(atPath: fixture.calls.appendingPathComponent("AGENTS.md").path) else { throw LiveFailure("AGENTS.md appeared in the calls folder; only the Settings button may write it") }
    }

    /// Esc closes the tags field without writing what was typed. A gets «клиент» and B «банк»
    /// from the detail, written to their folders and shown in their rows and the strip. The «банк» chip keeps only B; off again, A returns. A and
    /// B merged keep both tags.
    @MainActor private static func tagging(_ driver: Driver, _ fixture: Fixture) throws {
        _ = try driver.element("calls.select.\(d)")
        try driver.absent("calls.tagStrip")
        try driver.press("calls.select.\(a)")
        try driver.press("preview.editTags")
        try driver.typeTag("отмена")
        driver.pressEscape()
        try driver.absent("preview.tagEntry")
        _ = try driver.element("preview.editTags")
        guard fixture.tags(a) == nil else { throw LiveFailure("Esc wrote \(a)'s tags") }
        for (id, tag) in [(a, "клиент"), (b, "банк")] {
            try driver.press("calls.select.\(id)")
            try driver.press("preview.editTags")
            try driver.enterTag(tag)
            _ = try driver.wait("\(id)'s tags file") { fixture.tags(id) == "\(tag)\n" ? true : nil }
            _ = try driver.element("calls.select.\(id)", value: { $0.contains("#\(tag)") })
            _ = try driver.element("preview.editTags")
        }
        _ = try driver.element("calls.tag.клиент")
        try driver.screenshot("tagged", into: fixture.output)

        try driver.press("calls.tag.банк")
        try driver.absent("calls.select.\(a)")
        _ = try driver.element("calls.select.\(b)")
        try driver.screenshot("filtered", into: fixture.output)
        try driver.press("calls.tag.банк")
        _ = try driver.element("calls.select.\(a)")

        try driver.pressMergeControl()
        try driver.press("calls.select.\(a)")
        try driver.press("calls.select.\(b)")
        try driver.press("calls.merge.confirm")
        try driver.absent("calls.select.\(b)")
        _ = try driver.wait("the merged call's tags") { fixture.tags(a) == "клиент\nбанк\n" ? true : nil }
        _ = try driver.element("calls.select.\(a)", value: { $0.contains("#клиент") && $0.contains("#банк") })
        try driver.screenshot("merged", into: fixture.output)
    }
}
