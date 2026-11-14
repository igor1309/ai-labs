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

    /// Presses a row in merge mode and waits until it reads as marked or unmarked.
    func mark(_ id: String, _ marked: Bool) throws {
        try press("calls.select.\(id)")
        _ = try element("calls.select.\(id)", value: { $0.hasSuffix(marked ? ", Отмечен" : ", Не отмечен") })
    }

    /// The toolbar's merge control, found anywhere in the app: the toolbar is not inside the content view.
    func pressMergeControl() throws {
        let control = try wait("calls.merge") {
            descendants(root).first { string($0, kAXIdentifierAttribute) == "calls.merge" }
        }
        let error = AXUIElementPerformAction(control, kAXPressAction as CFString)
        guard error == .success else { throw LiveFailure("Press calls.merge: \(error.rawValue)") }
    }
}

/// A call folder with a sealed-length-unknown TrackFile track of one second and a one-line transcript.
private func makeCall(_ name: String, in calls: URL, saying words: String) throws -> Data {
    let folder = calls.appendingPathComponent(name)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    var track = Data()
    func integer<T: FixedWidthInteger>(_ value: T) { var bytes = value.bigEndian; withUnsafeBytes(of: &bytes) { track.append(contentsOf: $0) } }
    track.append(contentsOf: Array("caff".utf8)); integer(UInt16(1)); integer(UInt16(0))
    track.append(contentsOf: Array("desc".utf8)); integer(UInt64(32)); integer(Float64(48_000).bitPattern)
    track.append(contentsOf: Array("lpcm".utf8)); integer(UInt32(2)); integer(UInt32(2)); integer(UInt32(1)); integer(UInt32(1)); integer(UInt32(16))
    track.append(contentsOf: Array("data".utf8)); integer(UInt64.max); integer(UInt32(0))
    track.append(Data(repeating: 0, count: 48_000 * 2))
    try track.write(to: folder.appendingPathComponent("call.caf"))
    try "# Transcript\n\n**Me** 00:00:03\n\n\(words)\n".write(to: folder.appendingPathComponent("transcript.md"), atomically: true, encoding: .utf8)
    return track
}

@main private enum CallsMergeLive {
    @MainActor static func main() async {
        do {
            guard CommandLine.arguments.count == 2 else { throw LiveFailure("Usage: calls-merge <CallsRehearsal executable>") }
            guard AXIsProcessTrusted() else { throw LiveFailure("The live driver needs Accessibility access in this logged-in session.") }
            let app = URL(fileURLWithPath: CommandLine.arguments[1]).standardizedFileURL
            let output = FileManager.default.temporaryDirectory.appendingPathComponent("audelin-merge-live-\(UUID())")
            try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
            print("Artifacts: \(output.path)")
            try launch(app: app, output: output, name: "merge", run: merging)
            try launch(app: app, output: output, name: "failure", run: failing)
            print("PASS: merging neighbouring and far-apart calls, and a failed merge")
        } catch {
            fputs("FAIL: \(error)\n", stderr)
            exit(1)
        }
    }

    private static let a = "2024.01.01-1000", b = "2024.01.01-1020", u = "2024.01.01-1040", c = "2024.01.01-1100"

    @MainActor private static func launch(app: URL, output: URL, name: String,
                                          run: (Driver, URL, URL) throws -> Void) throws {
        let fixture = output.appendingPathComponent(name)
        let calls = fixture.appendingPathComponent("calls"), state = fixture.appendingPathComponent("state")
        for folder in [calls, state] { try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true) }
        let application = Process()
        application.executableURL = app
        application.arguments = ["--calls", calls.path, "--state", state.path, "--trash", fixture.appendingPathComponent("trash").path]
        defer {
            try? FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: calls.path)
            if application.isRunning { application.terminate() }
        }
        // The fixture is written before launch, so the driver watches the calls folder only.
        var tracks: [String: Data] = [:]
        let names = name == "merge" ? [a, b, u, c] : [a, b]
        for (index, call) in names.enumerated() { tracks[call] = try makeCall(call, in: calls, saying: "Часть \(index + 1).") }
        try tracks.map { ($0.key, $0.value) }.forEach { try $0.1.write(to: output.appendingPathComponent("\(name)-\($0.0).caf")) }
        try application.run()
        let driver = try Driver(process: application, folders: [calls])
        defer { driver.stop() }
        do { try run(driver, calls, output) }
        catch {
            try? driver.screenshot("\(name)-failure", into: output)
            throw error
        }
        for (call, bytes) in tracks {
            let found = try FileManager.default.subpathsOfDirectory(atPath: calls.path)
                .filter { $0.hasSuffix("\(call)/call.caf") }
            guard found.count == 1, try Data(contentsOf: calls.appendingPathComponent(found[0])) == bytes else {
                throw LiveFailure("\(call)'s audio changed or moved twice: \(found)")
            }
        }
        application.terminate()
        _ = try driver.wait("app termination") { application.isRunning ? nil : true }
    }

    /// S-1, then S-2: two neighbouring parts merge; the merged call and a call past an unmarked one ask first.
    @MainActor private static func merging(_ driver: Driver, _ calls: URL, _ output: URL) throws {
        _ = try driver.element("calls.select.\(c)")
        try driver.pressMergeControl()
        try driver.mark(a, true)
        try driver.mark(b, true)
        try driver.screenshot("merge-marked", into: output)
        try driver.press("calls.merge.confirm")
        try driver.absent("calls.select.\(b)")
        let merged = calls.appendingPathComponent(a)
        _ = try driver.wait("the merged folder") {
            FileManager.default.fileExists(atPath: merged.appendingPathComponent(b).path) ? true : nil
        }
        let transcript = try String(contentsOf: merged.appendingPathComponent("transcript.md"), encoding: .utf8)
        guard let first = transcript.range(of: "Часть 1."), let second = transcript.range(of: "Часть 2."),
              first.upperBound <= second.lowerBound else { throw LiveFailure("Merged transcript:\n\(transcript)") }
        guard !transcript.contains("Часть 3.") else { throw LiveFailure("The unrelated call joined:\n\(transcript)") }
        _ = try driver.element("calls.select.\(u)")
        try driver.screenshot("merged", into: output)

        try driver.pressMergeControl()
        try driver.mark(a, true)
        try driver.mark(c, true)
        try driver.press("calls.merge.confirm")
        _ = try driver.element("calls.merge.anyway")
        try driver.screenshot("merge-warning", into: output)
        try driver.press("calls.merge.back")
        try driver.absent("calls.merge.anyway")
        _ = try driver.element("calls.select.\(a)", value: { $0.hasSuffix(", Отмечен") })
        _ = try driver.element("calls.select.\(c)", value: { $0.hasSuffix(", Отмечен") })
        _ = try driver.element("calls.select.\(u)", value: { $0.hasSuffix(", Не отмечен") })
        try driver.press("calls.merge.confirm")
        try driver.press("calls.merge.anyway")
        try driver.absent("calls.select.\(c)")
        _ = try driver.wait("the merged-anyway folder") {
            FileManager.default.fileExists(atPath: merged.appendingPathComponent(c).path) ? true : nil
        }
        _ = try driver.element("calls.select.\(u)")
        try driver.screenshot("merged-anyway", into: output)
    }

    /// S-3: with the calls folder read-only, the merge fails, says why, and both parts stay.
    @MainActor private static func failing(_ driver: Driver, _ calls: URL, _ output: URL) throws {
        _ = try driver.element("calls.select.\(b)")
        try driver.pressMergeControl()
        try driver.mark(a, true)
        try driver.mark(b, true)
        try FileManager.default.setAttributes([.posixPermissions: 0o555], ofItemAtPath: calls.path)
        try driver.press("calls.merge.confirm")
        _ = try driver.element("calls.failure", value: { !$0.isEmpty })
        try driver.screenshot("merge-failed", into: output)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: calls.path)
        let left = try FileManager.default.contentsOfDirectory(atPath: calls.path).filter { !$0.hasPrefix(".") }.sorted()
        guard left == [a, b] else { throw LiveFailure("After a failed merge the folder holds \(left)") }
        _ = try driver.element("calls.select.\(a)")
        _ = try driver.element("calls.select.\(b)")
    }
}
