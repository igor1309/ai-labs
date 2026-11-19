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
    private var files: [DispatchSourceFileSystemObject]
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

    func watch(_ folder: URL) throws {
        let fd = open(folder.path, O_EVTONLY)
        guard fd >= 0 else { throw LiveFailure("Cannot watch \(folder.path)") }
        let source = DispatchSource.makeFileSystemObjectSource(fileDescriptor: fd, eventMask: .write, queue: .main)
        source.setEventHandler { CFRunLoopStop(CFRunLoopGetMain()) }
        source.setCancelHandler { close(fd) }
        source.resume()
        files.append(source)
    }

    func stop() {
        files.forEach { $0.cancel() }
        CFRunLoopRemoveSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(observer), .defaultMode)
    }

    private func observe() {
        let notifications = [kAXWindowCreatedNotification, kAXLayoutChangedNotification,
                             kAXValueChangedNotification, kAXUIElementDestroyedNotification,
                             kAXSelectedChildrenChangedNotification, kAXFocusedUIElementChangedNotification,
                             kAXTitleChangedNotification, kAXCreatedNotification, kAXMenuOpenedNotification, kAXMenuClosedNotification]
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
    func showMenu(_ id: String) throws {
        let target = try element("calls.select.\(id)")
        let error = AXUIElementPerformAction(target, kAXShowMenuAction as CFString)
        guard error == .success else { throw LiveFailure("Show menu \(id): \(error.rawValue)") }
    }

    func menuItem(_ identifier: String, enabled: Bool) throws -> AXUIElement {
        try wait(identifier) {
            descendants(root).first {
                string($0, kAXIdentifierAttribute) == identifier && (attribute($0, kAXEnabledAttribute) as? Bool) == enabled
            }
        }
    }

    func dismissMenu(_ item: AXUIElement) throws {
        guard let menu = attribute(item, kAXParentAttribute) else { throw LiveFailure("No menu parent") }
        let error = AXUIElementPerformAction(menu as! AXUIElement, kAXCancelAction as CFString)
        guard error == .success else { throw LiveFailure("Dismiss menu: \(error.rawValue)") }
    }

    func choose(_ item: AXUIElement) throws {
        let error = AXUIElementPerformAction(item, kAXPressAction as CFString)
        guard error == .success else { throw LiveFailure("Choose menu item: \(error.rawValue)") }
    }
}

private let a = "2024.01.01-1000", b = "2024.01.01-1006", d = "2024.01.01-1030"

@main private enum CallsTranscriptAgainLive {
    @MainActor static func main() async {
        var application: Process?, driver: Driver?, artifacts: URL?
        var failed = false
        defer {
            if let application, application.isRunning {
                application.terminate()
                _ = try? driver?.wait("app termination") { application.isRunning ? nil : true }
                if application.isRunning { kill(application.processIdentifier, SIGKILL) }
                application.waitUntilExit()
            }
            driver?.stop()
            if let artifacts { try? FileManager.default.removeItem(at: artifacts.appendingPathComponent("fixture")) }
            if failed { exit(1) }
        }
        do {
            guard CommandLine.arguments.count == 2 else { throw LiveFailure("Usage: calls-transcript-again <CallsRehearsal executable>") }
            guard AXIsProcessTrusted() else { throw LiveFailure("The live driver needs Accessibility access in this logged-in session.") }
            let root = FileManager.default.temporaryDirectory.appendingPathComponent("audelin-transcript-again-live-\(UUID())")
            artifacts = root
            let fixture = root.appendingPathComponent("fixture"), calls = fixture.appendingPathComponent("calls"),
                state = fixture.appendingPathComponent("state"), control = state.appendingPathComponent("control")
            for folder in [calls, control] { try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true) }
            print("Artifacts: \(root.path)")
            let process = Process()
            process.executableURL = URL(fileURLWithPath: CommandLine.arguments[1]).standardizedFileURL
            process.arguments = ["--calls", calls.path, "--state", state.path, "--trash", fixture.appendingPathComponent("trash").path,
                                 "--seed", "transcript-again"]
            application = process
            try process.run()
            let live = try Driver(process: process, folders: [calls, control])
            driver = live
            do {
                _ = try live.element("calls.select.\(a)")
                let transcript = calls.appendingPathComponent("\(a)/transcript.md"), previous = calls.appendingPathComponent("\(a)/transcript-previous.md")
                try live.watch(calls.appendingPathComponent(a))
                let old = try Data(contentsOf: transcript)
                let notes = try Data(contentsOf: calls.appendingPathComponent("\(a)/summary.md"))

                try live.showMenu(b)
                let missing = try live.menuItem("calls.transcriptAgain.\(b)", enabled: false)
                guard string(missing, kAXHelpAttribute).contains(b), string(missing, kAXHelpAttribute).contains("микрофона") else {
                    throw LiveFailure("The disabled item must name the missing track")
                }
                guard !descendants(live.root).contains(where: { string($0, kAXIdentifierAttribute) == "calls.restoreTranscript.\(b)" }) else {
                    throw LiveFailure("A call without a previous transcript offered restore")
                }
                try live.screenshot("missing-track", into: root)
                try live.dismissMenu(missing)

                // Making another call's notes holds the transcript offer until the notes finish.
                try live.press("calls.select.\(d)")
                try live.press("preview.make")
                _ = try live.element("preview.making")
                try live.showMenu(a)
                let busy = try live.menuItem("calls.transcriptAgain.\(a)", enabled: false)
                guard string(busy, kAXHelpAttribute) == "Audelin занят. Повторите, когда он освободится." else { throw LiveFailure("Busy offer has no localized reason") }
                try live.screenshot("busy", into: root)
                try live.dismissMenu(busy)
                try Data().write(to: control.appendingPathComponent("finish-1"))
                try live.press("calls.select.\(d)")
                _ = try live.element("preview.notes", value: { $0.contains("Обсудили выпуск Audelin.") })

                try live.showMenu(a)
                try live.choose(live.menuItem("calls.transcriptAgain.\(a)", enabled: true))
                // The restore offer is exposed only after publication and the refreshed listing.
                _ = try live.wait("the transcript changed") { () -> Bool? in
                    guard let bytes = try? Data(contentsOf: transcript), bytes != old,
                          (try? Data(contentsOf: previous)) == old else { return nil }
                    return true
                }
                let changed = try Data(contentsOf: transcript)
                guard let words = String(data: changed, encoding: .utf8), words.contains("Новый текст звонка."), words.contains("Новый текст микрофона.") else {
                    throw LiveFailure("The fixture recognition did not reach the saved transcript")
                }
                try live.screenshot("made-again", into: root)
                try live.showMenu(a)
                try live.choose(live.menuItem("calls.restoreTranscript.\(a)", enabled: true))
                _ = try live.wait("the previous transcript restored") {
                    (try? Data(contentsOf: transcript)) == old && (try? Data(contentsOf: previous)) == changed ? true : nil
                }
                guard try Data(contentsOf: calls.appendingPathComponent("\(a)/summary.md")) == notes else { throw LiveFailure("Transcript changes modified the kept notes") }
                try live.screenshot("restored", into: root)
                process.terminate()
                _ = try live.wait("app termination") { process.isRunning ? nil : true }
                print("PASS: transcript menu availability, missing tracks and busy reasons, fixture recognition keeping the previous bytes, and restore")
            } catch {
                try? live.screenshot("failure", into: root)
                throw error
            }
        } catch {
            fputs("FAIL: \(error)\n", stderr)
            failed = true
        }
    }

}
