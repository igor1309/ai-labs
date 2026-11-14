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

/// The calls `CallsRehearsal --seed merge` writes: A and B, one call cut off, with transcripts
/// and notes; C, whose transcript failed; D, with a transcript and no notes.
private let a = "2024.01.01-1000", b = "2024.01.01-1006", c = "2024.01.01-1012", d = "2024.01.01-1030"
private let busy = "Audelin занят; объедините звонки, когда он освободится."
private let needsTwo = "Отметьте хотя бы два звонка"

private struct Fixture {
    let calls: URL, state: URL, control: URL, trash: URL, output: URL
    func files(_ path: String = "") throws -> [String] {
        try FileManager.default.contentsOfDirectory(atPath: calls.appendingPathComponent(path).path)
            .filter { !$0.hasPrefix(".") }.sorted()
    }
}

@main private enum CallsMergeLive {
    @MainActor static func main() async {
        var output: URL?
        do {
            guard CommandLine.arguments.count == 2 else { throw LiveFailure("Usage: calls-merge <CallsRehearsal executable>") }
            guard AXIsProcessTrusted() else { throw LiveFailure("The live driver needs Accessibility access in this logged-in session.") }
            let app = URL(fileURLWithPath: CommandLine.arguments[1]).standardizedFileURL
            let root = FileManager.default.temporaryDirectory.appendingPathComponent("audelin-merge-live-\(UUID())")
            output = root
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
            print("Artifacts: \(root.path)")
            try launch(app: app, root: root, name: "refused", run: refusing)
            try launch(app: app, root: root, name: "merge", run: merging)
            try launch(app: app, root: root, name: "far-apart", run: farApart)
            try launch(app: app, root: root, name: "failure", run: failing)
            removeFixtures(root)
            print("PASS: refusing a call without a transcript, merging a cut call with its notes, the far-apart warning and a failed merge")
        } catch {
            fputs("FAIL: \(error)\n", stderr)
            if let output { removeFixtures(output) }
            exit(1)
        }
    }

    /// Keeps the screenshots and the merged transcript, and removes each scenario's seeded folder.
    private static func removeFixtures(_ root: URL) {
        for name in (try? FileManager.default.contentsOfDirectory(atPath: root.path)) ?? [] {
            let url = root.appendingPathComponent(name)
            guard (try? url.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory == true else { continue }
            try? FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: url.appendingPathComponent("calls").path)
            try? FileManager.default.removeItem(at: url)
        }
    }

    /// Launches the rehearsal on a fresh seeded folder, runs one scenario and quits it.
    @MainActor private static func launch(app: URL, root: URL, name: String, seed: String = "merge",
                                          run: (Driver, Fixture) throws -> Void) throws {
        let folder = root.appendingPathComponent(name)
        let fixture = Fixture(calls: folder.appendingPathComponent("calls"), state: folder.appendingPathComponent("state"),
                              control: folder.appendingPathComponent("state/control"), trash: folder.appendingPathComponent("trash"),
                              output: root)
        for made in [fixture.calls, fixture.control] { try FileManager.default.createDirectory(at: made, withIntermediateDirectories: true) }
        let application = Process()
        application.executableURL = app
        application.arguments = ["--calls", fixture.calls.path, "--state", fixture.state.path, "--trash", fixture.trash.path, "--seed", seed]
        defer {
            try? FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: fixture.calls.path)
            if application.isRunning { application.terminate() }
        }
        try application.run()
        let driver = try Driver(process: application, folders: [fixture.calls, fixture.control])
        defer { driver.stop() }
        do { try run(driver, fixture) }
        catch {
            try? driver.screenshot("\(name)-failure", into: root)
            throw error
        }
        application.terminate()
        _ = try driver.wait("app termination") { application.isRunning ? nil : true }
    }

    /// One marked call: Merge is disabled and says why. A call whose transcript failed is
    /// refused when the merge is confirmed: the window reads why and every call stays.
    @MainActor private static func refusing(_ driver: Driver, _ fixture: Fixture) throws {
        _ = try driver.element("calls.select.\(d)")
        try driver.pressMergeControl()
        try driver.mark(b, true)
        _ = try driver.element("calls.merge.confirm", value: { $0 == needsTwo })
        try driver.mark(c, true)
        _ = try driver.element("calls.merge.confirm", value: { $0.isEmpty })
        try driver.screenshot("refused-marked", into: fixture.output)
        try driver.press("calls.merge.confirm")
        _ = try driver.element("calls.failure", value: { $0.contains("«\(c)»") })
        _ = try driver.element("calls.select.\(b)", value: { $0.hasSuffix(", Отмечен") })
        _ = try driver.element("calls.select.\(c)", value: { $0.hasSuffix(", Отмечен") })
        try driver.screenshot("refused", into: fixture.output)
        guard try fixture.files() == [a, b, c, d] else { throw LiveFailure("After a refused merge the folder holds \(try fixture.files())") }
    }

    /// A and B merge into one call at A's start: the transcript holds A, the gap, then B with
    /// each part's speakers kept apart; the parts are kept whole inside it; its notes are made.
    @MainActor private static func merging(_ driver: Driver, _ fixture: Fixture) throws {
        _ = try driver.element("calls.select.\(d)")
        try driver.pressMergeControl()
        try driver.mark(a, true)
        try driver.mark(b, true)
        try driver.screenshot("merge-marked", into: fixture.output)
        try driver.press("calls.merge.confirm")
        try driver.absent("calls.select.\(b)")
        let merged = fixture.calls.appendingPathComponent(a)
        _ = try driver.wait("the merged folder") {
            FileManager.default.fileExists(atPath: merged.appendingPathComponent(b).path) ? true : nil
        }
        guard try fixture.files() == [a, c, d] else { throw LiveFailure("After the merge the folder holds \(try fixture.files())") }
        guard try fixture.files(a) == [a, b, "transcript.md"] else {
            throw LiveFailure("The merged call holds \(try fixture.files(a))")
        }
        for part in [a, b] where try fixture.files("\(a)/\(part)") != ["call.caf", "summary.md", "transcript.md"] {
            throw LiveFailure("Part \(part) holds \(try fixture.files("\(a)/\(part)"))")
        }
        let transcript = try String(contentsOf: merged.appendingPathComponent("transcript.md"), encoding: .utf8)
        try transcript.write(to: fixture.output.appendingPathComponent("merged-transcript.md"), atomically: true, encoding: .utf8)
        try checkJoined(transcript)
        // A merged call's length is its span, from A's start to B's end.
        _ = try driver.element("calls.select.\(a)", value: { $0.hasPrefix("6:10") })
        guard !FileManager.default.fileExists(atPath: fixture.trash.path) else { throw LiveFailure("A merge moved something to the Trash") }
        try driver.screenshot("merged", into: fixture.output)
        // Notes are off in the rehearsal, so the merged call offers its notes as an ended call does.
        try driver.press("preview.make")
        _ = try driver.wait("the merged call's notes started") {
            FileManager.default.fileExists(atPath: fixture.control.appendingPathComponent("started-1").path) ? true : nil
        }
        try Data().write(to: fixture.control.appendingPathComponent("finish-1"))
        _ = try driver.element("preview.notes", value: { $0.contains("Обсудили выпуск Audelin.") })
        let notes = try String(contentsOf: merged.appendingPathComponent("summary.md"), encoding: .utf8)
        guard notes.contains("Обсудили выпуск Audelin.") else { throw LiveFailure("Merged notes:\n\(notes)") }
        try driver.screenshot("merged-notes", into: fixture.output)
    }

    /// A's rows, a gap row, then B's rows, with no remote label shared between the parts.
    private static func checkJoined(_ transcript: String) throws {
        let order = ["Часть один.", "Ответ один.", "**Gap**", "Часть два.", "Ответ два."]
        let places = order.map { transcript.range(of: $0)?.lowerBound }
        guard places.allSatisfy({ $0 != nil }), zip(places, places.dropFirst()).allSatisfy({ $0! < $1! }) else {
            throw LiveFailure("Merged transcript out of order:\n\(transcript)")
        }
        /// The remote label heading the row with these words, such as `Them 2`.
        func label(before words: String) -> String? {
            guard let end = transcript.range(of: words)?.lowerBound,
                  let open = transcript[..<end].range(of: "**Them", options: .backwards),
                  let close = transcript[open.upperBound..<end].range(of: "**") else { return nil }
            return String(transcript[transcript.index(open.lowerBound, offsetBy: 2)..<close.lowerBound])
        }
        guard let first = label(before: "Ответ один."), let second = label(before: "Ответ два."), first != second else {
            throw LiveFailure("The parts' speakers share a label:\n\(transcript)")
        }
    }

    /// Calls with another between them ask again; going back keeps the marks; merging anyway merges.
    @MainActor private static func farApart(_ driver: Driver, _ fixture: Fixture) throws {
        _ = try driver.element("calls.select.\(d)")
        try driver.pressMergeControl()
        try driver.mark(a, true)
        try driver.mark(d, true)
        try driver.press("calls.merge.confirm")
        _ = try driver.element("calls.merge.anyway")
        try driver.screenshot("merge-warning", into: fixture.output)
        try driver.press("calls.merge.back")
        try driver.absent("calls.merge.anyway")
        _ = try driver.element("calls.select.\(a)", value: { $0.hasSuffix(", Отмечен") })
        _ = try driver.element("calls.select.\(d)", value: { $0.hasSuffix(", Отмечен") })
        _ = try driver.element("calls.select.\(b)", value: { $0.hasSuffix(", Не отмечен") })
        try driver.press("calls.merge.confirm")
        try driver.press("calls.merge.anyway")
        try driver.absent("calls.select.\(d)")
        _ = try driver.wait("the merged-anyway folder") {
            FileManager.default.fileExists(atPath: fixture.calls.appendingPathComponent("\(a)/\(d)").path) ? true : nil
        }
        _ = try driver.element("calls.select.\(b)")
        try driver.screenshot("merged-anyway", into: fixture.output)
    }

    /// With the calls folder read-only, the merge fails, says why, and both parts stay.
    @MainActor private static func failing(_ driver: Driver, _ fixture: Fixture) throws {
        _ = try driver.element("calls.select.\(d)")
        try driver.pressMergeControl()
        try driver.mark(a, true)
        try driver.mark(b, true)
        try FileManager.default.setAttributes([.posixPermissions: 0o555], ofItemAtPath: fixture.calls.path)
        try driver.press("calls.merge.confirm")
        _ = try driver.element("calls.failure", value: { !$0.isEmpty })
        try driver.screenshot("merge-failed", into: fixture.output)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: fixture.calls.path)
        guard try fixture.files() == [a, b, c, d] else { throw LiveFailure("After a failed merge the folder holds \(try fixture.files())") }
        _ = try driver.element("calls.select.\(a)")
        _ = try driver.element("calls.select.\(b)")
    }
}
